/**
 * reconcile-inventory-fulfillment.ts
 *
 * Idempotent retroactive fix for approved orders whose reserved inventory
 * allocations were never converted to "fulfilled".
 *
 * Targets: orders where approvedAt IS NOT NULL (or status = "approved")
 *          with inventory_allocations still in status = "reserved"
 *
 * For each such allocation it:
 *   1. Decrements product_inventory.quantityReserved
 *   2. Sets inventory_allocation.status = "fulfilled"
 *   3. Inserts an inventory_movements record (reason = "order_fulfilled")
 *
 * Safe to run multiple times — only processes allocations still in "reserved".
 * Never deletes or resets any data.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run reconcile-inventory-fulfillment
 */

import {
  db,
  ordersTable,
  inventoryAllocationsTable,
  productInventoryTable,
  inventoryMovementsTable,
} from "@workspace/db";
import { eq, and, isNotNull, or, inArray } from "drizzle-orm";

async function main() {
  console.log("[reconcile] Starting inventory fulfillment reconciliation...");

  // 1. Find all approved orders (approvedAt is set OR status = "approved")
  const approvedOrders = await db
    .select({ id: ordersTable.id, orderNumber: ordersTable.orderNumber, approvedAt: ordersTable.approvedAt })
    .from(ordersTable)
    .where(
      or(
        isNotNull(ordersTable.approvedAt),
        eq(ordersTable.status, "approved"),
      ),
    );

  if (approvedOrders.length === 0) {
    console.log("[reconcile] No approved orders found. Nothing to do.");
    return;
  }

  console.log(`[reconcile] Found ${approvedOrders.length} approved order(s).`);

  const orderIds = approvedOrders.map((o) => o.id);

  // 2. Find all STILL-RESERVED allocations for those orders
  const pendingAllocations = await db
    .select()
    .from(inventoryAllocationsTable)
    .where(
      and(
        inArray(inventoryAllocationsTable.orderId, orderIds),
        eq(inventoryAllocationsTable.status, "reserved"),
      ),
    );

  if (pendingAllocations.length === 0) {
    console.log("[reconcile] No reserved allocations found for approved orders. All clean!");
    return;
  }

  console.log(`[reconcile] Found ${pendingAllocations.length} reserved allocation(s) to reconcile.`);

  const orderMap = Object.fromEntries(approvedOrders.map((o) => [o.id, o.orderNumber]));

  let processed = 0;
  let skipped = 0;

  for (const alloc of pendingAllocations) {
    const orderNumber = orderMap[alloc.orderId] ?? `#${alloc.orderId}`;
    console.log(
      `[reconcile]   allocation id=${alloc.id} order=${orderNumber} product=${alloc.productId} pool=${alloc.poolId} qty=${alloc.quantity}`,
    );

    // 3a. Load the matching product_inventory row
    const [invRow] = await db
      .select()
      .from(productInventoryTable)
      .where(
        and(
          eq(productInventoryTable.productId, alloc.productId),
          eq(productInventoryTable.poolId, alloc.poolId),
        ),
      );

    if (invRow) {
      const newReserved = Math.max(0, invRow.quantityReserved - alloc.quantity);
      await db
        .update(productInventoryTable)
        .set({ quantityReserved: newReserved })
        .where(eq(productInventoryTable.id, invRow.id));
      console.log(
        `[reconcile]     quantityReserved ${invRow.quantityReserved} → ${newReserved}`,
      );
    } else {
      console.warn(
        `[reconcile]     WARNING: no product_inventory row for product=${alloc.productId} pool=${alloc.poolId} — skipping stock drain`,
      );
      skipped++;
    }

    // 3b. Mark allocation as fulfilled
    await db
      .update(inventoryAllocationsTable)
      .set({ status: "fulfilled" })
      .where(eq(inventoryAllocationsTable.id, alloc.id));

    // 3c. Insert movement record
    await db.insert(inventoryMovementsTable).values({
      productId: alloc.productId,
      poolId: alloc.poolId,
      quantityDelta: 0,
      reason: "order_fulfilled",
      referenceType: "order",
      referenceId: alloc.orderId,
      createdBy: null,
    });

    processed++;
  }

  console.log(`[reconcile] Done. ${processed} allocation(s) reconciled, ${skipped} product_inventory row(s) missing (stock drain skipped for those).`);
}

main().catch((err) => {
  console.error("[reconcile] Fatal error:", err);
  process.exit(1);
});
