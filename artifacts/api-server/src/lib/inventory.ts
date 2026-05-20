import { db, inventoryPoolsTable, productInventoryTable, inventoryAllocationsTable, inventoryMovementsTable, productsTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";

const PHYSICAL_SOURCES = new Set(["phone", "whatsapp", "sales_rep", "b2b", "direct"]);
const ONLINE_SOURCES = new Set(["web", "online"]);
const SAMPLE_SOURCES = new Set(["sample", "free_issue"]);

export function getPoolNameForOrderSource(orderSource: string): string {
  if (ONLINE_SOURCES.has(orderSource)) return "online_sales";
  if (SAMPLE_SOURCES.has(orderSource)) return "free_samples";
  return "physical_sales"; // default covers PHYSICAL_SOURCES + anything unknown
}

export interface StockWarning {
  productId: number;
  productName: string;
  requested: number;
  available: number;
  poolName: string;
}

export interface AllocationResult {
  warnings: StockWarning[];
}

/**
 * Allocates stock for each order item against the given pool within a transaction.
 * Items with sufficient stock are reserved (quantity deducted from available, added to reserved).
 * Items with insufficient stock create an "insufficient" allocation record with no stock change.
 */
export async function allocateStockForOrder(
  tx: any,
  orderId: number,
  orderSource: string,
  items: Array<{ productId: number; quantity: number; productName?: string }>,
  userId: number,
): Promise<AllocationResult> {
  const poolName = getPoolNameForOrderSource(orderSource);

  const [pool] = await tx.select().from(inventoryPoolsTable).where(eq(inventoryPoolsTable.name, poolName));
  if (!pool) return { warnings: [] };

  // Fetch product names if not provided
  const productIds = items.map(i => i.productId);
  const productRows = productIds.length > 0
    ? await tx.select({ id: productsTable.id, productName: productsTable.productName })
        .from(productsTable)
        .where(inArray(productsTable.id, productIds))
    : [];
  const productNameMap = Object.fromEntries(productRows.map((p: any) => [p.id, p.productName]));

  const warnings: StockWarning[] = [];

  for (const item of items) {
    const name = item.productName ?? productNameMap[item.productId] ?? "Unknown";

    // Get or implicitly treat as 0 if no row exists yet
    const [invRow] = await tx.select()
      .from(productInventoryTable)
      .where(and(
        eq(productInventoryTable.productId, item.productId),
        eq(productInventoryTable.poolId, pool.id),
      ));

    const available = invRow?.quantityAvailable ?? 0;

    if (available >= item.quantity) {
      // Full reservation
      if (invRow) {
        await tx.update(productInventoryTable)
          .set({
            quantityAvailable: invRow.quantityAvailable - item.quantity,
            quantityReserved: invRow.quantityReserved + item.quantity,
          })
          .where(eq(productInventoryTable.id, invRow.id));
      } else {
        // Row doesn't exist yet — insert with negative available (edge case: stock was never set up)
        await tx.insert(productInventoryTable).values({
          productId: item.productId,
          poolId: pool.id,
          quantityAvailable: 0,
          quantityReserved: item.quantity,
        });
      }

      await tx.insert(inventoryAllocationsTable).values({
        orderId,
        productId: item.productId,
        poolId: pool.id,
        quantity: item.quantity,
        status: "reserved",
      });

      await tx.insert(inventoryMovementsTable).values({
        productId: item.productId,
        poolId: pool.id,
        quantityDelta: -item.quantity,
        reason: "order_reserved",
        referenceType: "order",
        referenceId: orderId,
        createdBy: userId,
      });
    } else {
      // Insufficient — record the gap, no stock change
      await tx.insert(inventoryAllocationsTable).values({
        orderId,
        productId: item.productId,
        poolId: pool.id,
        quantity: item.quantity,
        status: "insufficient",
      });

      warnings.push({
        productId: item.productId,
        productName: name,
        requested: item.quantity,
        available,
        poolName,
      });
    }
  }

  return { warnings };
}

/**
 * Releases reserved stock back to the pool when an order is cancelled.
 * If the order is already accounting-approved or invoice-triggered, marks allocations
 * for manual review instead of auto-releasing.
 */
export async function releaseStockForOrder(
  tx: any,
  orderId: number,
  approvedAt: Date | null | undefined,
  invoiceTriggeredAt: Date | null | undefined,
  userId: number,
): Promise<{ needsManualReview: boolean }> {
  const needsManualReview = !!(approvedAt || invoiceTriggeredAt);

  const allocations = await tx.select()
    .from(inventoryAllocationsTable)
    .where(and(
      eq(inventoryAllocationsTable.orderId, orderId),
      eq(inventoryAllocationsTable.status, "reserved"),
    ));

  if (allocations.length === 0) return { needsManualReview: false };

  if (needsManualReview) {
    // Flag for human review — do NOT auto-return stock
    const allocationIds = allocations.map((a: any) => a.id);
    await tx.update(inventoryAllocationsTable)
      .set({ status: "manual_review" })
      .where(inArray(inventoryAllocationsTable.id, allocationIds));
    return { needsManualReview: true };
  }

  // Auto-release: return stock to available
  for (const alloc of allocations) {
    const [invRow] = await tx.select()
      .from(productInventoryTable)
      .where(and(
        eq(productInventoryTable.productId, alloc.productId),
        eq(productInventoryTable.poolId, alloc.poolId),
      ));

    if (invRow) {
      await tx.update(productInventoryTable)
        .set({
          quantityAvailable: invRow.quantityAvailable + alloc.quantity,
          quantityReserved: Math.max(0, invRow.quantityReserved - alloc.quantity),
        })
        .where(eq(productInventoryTable.id, invRow.id));
    }

    await tx.update(inventoryAllocationsTable)
      .set({ status: "released" })
      .where(eq(inventoryAllocationsTable.id, alloc.id));

    await tx.insert(inventoryMovementsTable).values({
      productId: alloc.productId,
      poolId: alloc.poolId,
      quantityDelta: alloc.quantity,
      reason: "order_cancelled_released",
      referenceType: "order",
      referenceId: orderId,
      createdBy: userId,
    });
  }

  return { needsManualReview: false };
}
