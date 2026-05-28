/**
 * reconcile-inventory-fulfillment.ts
 *
 * Idempotent retroactive fix for approved orders whose inventory was never
 * properly marked as "fulfilled".
 *
 * Strategy (uses ORDER ITEMS as source of truth, not allocations):
 *   1. Find all orders where approvedAt IS NOT NULL or status = "approved"
 *   2. For each: load order items + order source → determine pool
 *   3. For each product/item:
 *      - Idempotency check: does an inventory_movements row with
 *        reason="order_fulfilled", referenceType="order", referenceId=orderId,
 *        productId, poolId already exist?  If YES → skip.
 *      - If NO: ensure an inventory_allocations row with status="fulfilled"
 *        exists (create or update), then insert the missing movement.
 *   4. Never touches quantityAvailable or quantityReserved.
 *
 * Safe to run multiple times. Never deletes data.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run reconcile-inventory-fulfillment
 */

import {
  db,
  ordersTable,
  orderItemsTable,
  inventoryPoolsTable,
  inventoryAllocationsTable,
  inventoryMovementsTable,
} from "@workspace/db";
import { eq, and, or, isNotNull, inArray } from "drizzle-orm";

const ONLINE_SOURCES = new Set(["web", "online"]);
const SAMPLE_SOURCES = new Set(["sample", "free_issue"]);

function getPoolName(orderSource: string): string {
  if (ONLINE_SOURCES.has(orderSource)) return "online_sales";
  if (SAMPLE_SOURCES.has(orderSource)) return "free_samples";
  return "physical_sales";
}

async function main() {
  console.log("[reconcile] Starting inventory fulfillment reconciliation...");

  // 1. Load all approved orders
  const approvedOrders = await db
    .select({
      id:          ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      orderSource: ordersTable.orderSource,
    })
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

  // 2. Load all pools by name (one query)
  const allPools = await db.select().from(inventoryPoolsTable);
  const poolByName = Object.fromEntries(allPools.map((p) => [p.name, p]));

  // 3. Load all order items for these orders (one batch query)
  const allItems = await db
    .select()
    .from(orderItemsTable)
    .where(inArray(orderItemsTable.orderId, orderIds));

  if (allItems.length === 0) {
    console.log("[reconcile] Approved orders have no order items. Nothing to do.");
    return;
  }

  const itemsByOrder = allItems.reduce<Record<number, typeof allItems>>((acc, item) => {
    (acc[item.orderId] ??= []).push(item);
    return acc;
  }, {});

  // 4. Load all existing order_fulfilled movements for these orders (idempotency check)
  const existingMovements = await db
    .select({
      referenceId: inventoryMovementsTable.referenceId,
      productId:   inventoryMovementsTable.productId,
      poolId:      inventoryMovementsTable.poolId,
    })
    .from(inventoryMovementsTable)
    .where(
      and(
        eq(inventoryMovementsTable.reason, "order_fulfilled"),
        eq(inventoryMovementsTable.referenceType, "order"),
        inArray(inventoryMovementsTable.referenceId, orderIds),
      ),
    );

  // "orderId:productId:poolId" → already processed
  const doneSet = new Set(
    existingMovements.map((m) => `${m.referenceId}:${m.productId}:${m.poolId}`),
  );

  // 5. Load all existing allocations for these orders (any status)
  const existingAllocations = await db
    .select()
    .from(inventoryAllocationsTable)
    .where(inArray(inventoryAllocationsTable.orderId, orderIds));

  // "orderId:productId:poolId" → allocation row
  const allocMap = new Map(
    existingAllocations.map((a) => [`${a.orderId}:${a.productId}:${a.poolId}`, a]),
  );

  let processed = 0;
  let skipped   = 0;
  let warnings  = 0;

  for (const order of approvedOrders) {
    const items = itemsByOrder[order.id] ?? [];
    if (items.length === 0) continue;

    const poolName = getPoolName(order.orderSource);
    const pool     = poolByName[poolName];

    if (!pool) {
      console.warn(
        `[reconcile]   WARN: order ${order.orderNumber ?? order.id}: pool "${poolName}" not found in DB — skipping`,
      );
      warnings++;
      continue;
    }

    for (const item of items) {
      const key = `${order.id}:${item.productId}:${pool.id}`;

      if (doneSet.has(key)) {
        skipped++;
        continue; // already has an order_fulfilled movement → skip
      }

      console.log(
        `[reconcile]   order=${order.orderNumber ?? order.id} product=${item.productId} pool=${poolName} qty=${item.quantity}`,
      );

      // --- Ensure a "fulfilled" allocation record exists ---
      const existingAlloc = allocMap.get(key);

      if (!existingAlloc) {
        // No allocation row at all — create one with status="fulfilled"
        await db.insert(inventoryAllocationsTable).values({
          orderId:   order.id,
          productId: item.productId,
          poolId:    pool.id,
          quantity:  item.quantity,
          status:    "fulfilled",
        });
        console.log(`[reconcile]     → created fulfilled allocation (qty=${item.quantity})`);
      } else if (existingAlloc.status !== "fulfilled") {
        // Row exists but not yet fulfilled — update it
        await db
          .update(inventoryAllocationsTable)
          .set({ status: "fulfilled" })
          .where(eq(inventoryAllocationsTable.id, existingAlloc.id));
        console.log(
          `[reconcile]     → updated allocation id=${existingAlloc.id} from "${existingAlloc.status}" → "fulfilled"`,
        );
      } else {
        // Allocation is already fulfilled but movement was missing
        console.log(
          `[reconcile]     → allocation id=${existingAlloc.id} already fulfilled; inserting missing movement`,
        );
      }

      // --- Insert the missing order_fulfilled movement ---
      await db.insert(inventoryMovementsTable).values({
        productId:     item.productId,
        poolId:        pool.id,
        quantityDelta: 0,        // available was already deducted at reservation time
        reason:        "order_fulfilled",
        referenceType: "order",
        referenceId:   order.id,
        createdBy:     null,
      });

      processed++;
    }
  }

  console.log(
    `[reconcile] Done. ${processed} item(s) reconciled, ${skipped} already-fulfilled item(s) skipped, ${warnings} warning(s).`,
  );
}

main().catch((err) => {
  console.error("[reconcile] Fatal error:", err);
  process.exit(1);
});
