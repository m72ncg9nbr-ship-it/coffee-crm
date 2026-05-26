import { Router, type IRouter } from "express";
import { db, inventoryPoolsTable, productInventoryTable, inventoryAllocationsTable, inventoryMovementsTable, productsTable, ordersTable } from "@workspace/db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  ListInventoryStockParams,
  UpsertInventoryStockBody,
  AdjustInventoryBody,
  ListInventoryAllocationsParams,
  ListInventoryMovementsParams,
} from "@workspace/api-zod";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

// GET /api/inventory/pools
router.get("/inventory/pools", requireAuth as any, async (_req, res): Promise<void> => {
  const pools = await db.select().from(inventoryPoolsTable).orderBy(inventoryPoolsTable.id);
  res.json(pools);
});

// GET /api/inventory/stock
router.get("/inventory/stock", requireAuth as any, async (req, res): Promise<void> => {
  const qp = ListInventoryStockParams.safeParse(req.query);
  const productIdFilter = qp.success ? qp.data.productId : undefined;

  const products = await db.select().from(productsTable).orderBy(productsTable.productName);
  const pools = await db.select().from(inventoryPoolsTable).orderBy(inventoryPoolsTable.id);

  const productIds = productIdFilter
    ? products.filter(p => p.id === productIdFilter).map(p => p.id)
    : products.map(p => p.id);

  if (productIds.length === 0) { res.json([]); return; }

  const invRows = await db.select()
    .from(productInventoryTable)
    .where(inArray(productInventoryTable.productId, productIds));

  const invMap = new Map<string, typeof invRows[0]>();
  for (const row of invRows) {
    invMap.set(`${row.productId}:${row.poolId}`, row);
  }

  // Sum of fulfilled (used/sold) quantities per product × pool
  const fulfilledRows = await db
    .select({
      productId: inventoryAllocationsTable.productId,
      poolId:    inventoryAllocationsTable.poolId,
      total:     sql<number>`cast(sum(${inventoryAllocationsTable.quantity}) as int)`,
    })
    .from(inventoryAllocationsTable)
    .where(eq(inventoryAllocationsTable.status, "fulfilled"))
    .groupBy(inventoryAllocationsTable.productId, inventoryAllocationsTable.poolId);

  const fulfilledMap = new Map<string, number>();
  for (const row of fulfilledRows) {
    fulfilledMap.set(`${row.productId}:${row.poolId}`, row.total ?? 0);
  }

  const result = products
    .filter(p => productIdFilter == null || p.id === productIdFilter)
    .map(p => ({
      productId: p.id,
      productName: p.productName,
      sku: p.sku,
      category: p.category,
      businessChannel: p.businessChannel,
      pools: pools.map(pool => {
        const inv = invMap.get(`${p.id}:${pool.id}`);
        return {
          poolId:             pool.id,
          poolName:           pool.name,
          poolLabel:          pool.label,
          quantityAvailable:  inv?.quantityAvailable ?? 0,
          quantityReserved:   inv?.quantityReserved  ?? 0,
          quantityFulfilled:  fulfilledMap.get(`${p.id}:${pool.id}`) ?? 0,
        };
      }),
    }));

  res.json(result);
});

// PUT /api/inventory/stock — set absolute quantity_available for a product+pool
router.put("/inventory/stock", requireAuth as any, async (req, res): Promise<void> => {
  const parsed = UpsertInventoryStockBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { productId, poolId, quantityAvailable } = parsed.data;
  const user = (req as any).user;

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const [pool] = await db.select().from(inventoryPoolsTable).where(eq(inventoryPoolsTable.id, poolId));
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [existing] = await db.select().from(productInventoryTable)
    .where(and(eq(productInventoryTable.productId, productId), eq(productInventoryTable.poolId, poolId)));

  let row: typeof productInventoryTable.$inferSelect;
  if (existing) {
    const delta = quantityAvailable - existing.quantityAvailable;
    [row] = await db.update(productInventoryTable)
      .set({ quantityAvailable })
      .where(eq(productInventoryTable.id, existing.id))
      .returning();

    await db.insert(inventoryMovementsTable).values({
      productId,
      poolId,
      quantityDelta: delta,
      reason: "manual_set",
      referenceType: "manual",
      createdBy: user.id,
    });
  } else {
    [row] = await db.insert(productInventoryTable)
      .values({ productId, poolId, quantityAvailable, quantityReserved: 0 })
      .returning();

    await db.insert(inventoryMovementsTable).values({
      productId,
      poolId,
      quantityDelta: quantityAvailable,
      reason: "manual_set",
      referenceType: "manual",
      createdBy: user.id,
    });
  }

  await logActivity({
    actionType: "inventory_stock_set",
    entityType: "product",
    entityId: productId,
    description: `Stock set to ${quantityAvailable} for "${product.productName}" in pool "${pool.label}"`,
    performedBy: user.id,
  });

  res.json({
    productId: row.productId,
    poolId: row.poolId,
    quantityAvailable: row.quantityAvailable,
    quantityReserved: row.quantityReserved,
  });
});

// POST /api/inventory/adjust — apply a signed delta to quantity_available
router.post("/inventory/adjust", requireAuth as any, async (req, res): Promise<void> => {
  const parsed = AdjustInventoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { productId, poolId, delta, reason } = parsed.data;
  const user = (req as any).user;

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const [pool] = await db.select().from(inventoryPoolsTable).where(eq(inventoryPoolsTable.id, poolId));
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  const [existing] = await db.select().from(productInventoryTable)
    .where(and(eq(productInventoryTable.productId, productId), eq(productInventoryTable.poolId, poolId)));

  const currentAvailable = existing?.quantityAvailable ?? 0;
  const newAvailable = Math.max(0, currentAvailable + delta);

  let row: typeof productInventoryTable.$inferSelect;
  if (existing) {
    [row] = await db.update(productInventoryTable)
      .set({ quantityAvailable: newAvailable })
      .where(eq(productInventoryTable.id, existing.id))
      .returning();
  } else {
    [row] = await db.insert(productInventoryTable)
      .values({ productId, poolId, quantityAvailable: newAvailable, quantityReserved: 0 })
      .returning();
  }

  await db.insert(inventoryMovementsTable).values({
    productId,
    poolId,
    quantityDelta: delta,
    reason,
    referenceType: "manual",
    createdBy: user.id,
  });

  await logActivity({
    actionType: "inventory_adjusted",
    entityType: "product",
    entityId: productId,
    description: `Stock adjusted ${delta > 0 ? "+" : ""}${delta} for "${product.productName}" in pool "${pool.label}" (reason: ${reason})`,
    performedBy: user.id,
  });

  res.json({
    productId: row.productId,
    poolId: row.poolId,
    quantityAvailable: row.quantityAvailable,
    quantityReserved: row.quantityReserved,
  });
});

// GET /api/inventory/allocations
router.get("/inventory/allocations", requireAuth as any, async (req, res): Promise<void> => {
  const qp = ListInventoryAllocationsParams.safeParse(req.query);
  const { orderId, status } = qp.success ? qp.data : {} as any;

  const allocs = await db.select().from(inventoryAllocationsTable).orderBy(desc(inventoryAllocationsTable.createdAt));

  const filtered = allocs.filter(a => {
    if (orderId && a.orderId !== orderId) return false;
    if (status && a.status !== status) return false;
    return true;
  });

  const productIds = [...new Set(filtered.map(a => a.productId))];
  const poolIds = [...new Set(filtered.map(a => a.poolId))];
  const orderIds = [...new Set(filtered.map(a => a.orderId))];

  const [products, pools, orders] = await Promise.all([
    productIds.length > 0 ? db.select({ id: productsTable.id, productName: productsTable.productName }).from(productsTable).where(inArray(productsTable.id, productIds)) : [],
    poolIds.length > 0 ? db.select().from(inventoryPoolsTable).where(inArray(inventoryPoolsTable.id, poolIds)) : [],
    orderIds.length > 0 ? db.select({ id: ordersTable.id, orderNumber: ordersTable.orderNumber }).from(ordersTable).where(inArray(ordersTable.id, orderIds)) : [],
  ]);

  const productMap = Object.fromEntries((products as any[]).map((p: any) => [p.id, p.productName]));
  const poolMap = Object.fromEntries((pools as any[]).map((p: any) => [p.id, p.name]));
  const orderMap = Object.fromEntries((orders as any[]).map((o: any) => [o.id, o.orderNumber]));

  res.json(filtered.map(a => ({
    id: a.id,
    orderId: a.orderId,
    orderNumber: orderMap[a.orderId] ?? null,
    productId: a.productId,
    productName: productMap[a.productId] ?? "Unknown",
    poolId: a.poolId,
    poolName: poolMap[a.poolId] ?? "Unknown",
    quantity: a.quantity,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  })));
});

// GET /api/inventory/movements
router.get("/inventory/movements", requireAuth as any, async (req, res): Promise<void> => {
  const qp = ListInventoryMovementsParams.safeParse(req.query);
  const { productId, poolId, limit: lim } = qp.success ? qp.data : {} as any;

  let movements = await db.select()
    .from(inventoryMovementsTable)
    .orderBy(desc(inventoryMovementsTable.createdAt));

  if (productId) movements = movements.filter(m => m.productId === productId);
  if (poolId) movements = movements.filter(m => m.poolId === poolId);
  if (lim) movements = movements.slice(0, lim);

  const productIds = [...new Set(movements.map(m => m.productId))];
  const poolIds = [...new Set(movements.map(m => m.poolId))];

  const [products, pools] = await Promise.all([
    productIds.length > 0 ? db.select({ id: productsTable.id, productName: productsTable.productName }).from(productsTable).where(inArray(productsTable.id, productIds)) : [],
    poolIds.length > 0 ? db.select().from(inventoryPoolsTable).where(inArray(inventoryPoolsTable.id, poolIds)) : [],
  ]);

  const productMap = Object.fromEntries((products as any[]).map((p: any) => [p.id, p.productName]));
  const poolMap = Object.fromEntries((pools as any[]).map((p: any) => [p.id, p.name]));

  res.json(movements.map(m => ({
    id: m.id,
    productId: m.productId,
    productName: productMap[m.productId] ?? "Unknown",
    poolId: m.poolId,
    poolName: poolMap[m.poolId] ?? "Unknown",
    quantityDelta: m.quantityDelta,
    reason: m.reason,
    referenceType: m.referenceType ?? null,
    referenceId: m.referenceId ?? null,
    createdBy: m.createdBy ?? null,
    createdAt: m.createdAt.toISOString(),
  })));
});

export default router;
