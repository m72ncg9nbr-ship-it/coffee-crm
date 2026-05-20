import { Router, type IRouter } from "express";
import { db, ordersTable, orderItemsTable, customersTable, customerAddressesTable, deliveriesTable, usersTable, productsTable } from "@workspace/db";
import { eq, inArray, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logActivity } from "../lib/activity";
import { allocateStockForOrder, releaseStockForOrder } from "../lib/inventory";
import {
  CreateOrderBody,
  UpdateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  ListOrdersQueryParams,
  AddOrderItemBody,
  DeleteOrderItemParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeOrder(order: typeof ordersTable.$inferSelect, customerName?: string, createdByName?: string | null) {
  return {
    ...order,
    customerName: customerName ?? "Unknown",
    createdByName: createdByName ?? null,
    totalAmount: parseFloat(order.totalAmount),
    requestedDeliveryDate: order.requestedDeliveryDate ?? null,
    approvedAt: order.approvedAt?.toISOString() ?? null,
    invoiceTriggeredAt: order.invoiceTriggeredAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

// Spec: order is incomplete if missing customer / delivery address / items / delivery date
async function evaluateOrderCompleteness(orderId: number, customerId: number, requestedDeliveryDate: string | null | undefined): Promise<"new" | "incomplete"> {
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  if (items.length === 0) return "incomplete";
  if (!requestedDeliveryDate) return "incomplete";
  const addr = await db.select().from(customerAddressesTable)
    .where(and(eq(customerAddressesTable.customerId, customerId), eq(customerAddressesTable.isDeliveryAddress, true)));
  if (addr.length === 0) return "incomplete";
  return "new";
}

async function nextDeliveryNumberInTx(tx: any): Promise<string> {
  const rows = await tx.execute(sql`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(delivery_number, '[^0-9]', '', 'g'), '')::int), 0) + 1 AS next
    FROM deliveries
  `);
  const n = Number((rows as any).rows?.[0]?.next ?? (rows as any)[0]?.next ?? 1);
  return `DEL-${String(n).padStart(4, "0")}`;
}

// Auto-creates an unassigned delivery for a valid order (spec: auto-create delivery from order).
// Uses a per-order advisory lock to prevent concurrent duplicates, with a retry on
// delivery_number unique-constraint conflicts.
async function autoCreateDeliveryForOrder(order: typeof ordersTable.$inferSelect, userId: number): Promise<void> {
  const result = await db.transaction(async (tx) => {
    // Serialize concurrent auto-create calls for this order across requests.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${order.id}::bigint)`);

    const existing = await tx.select().from(deliveriesTable).where(eq(deliveriesTable.orderId, order.id));
    if (existing.length > 0) {
      // Delivery already exists - just make sure the order is marked planned if it
      // is still sitting in "new" / "incomplete".
      if (order.status === "new" || order.status === "incomplete") {
        await tx.update(ordersTable).set({ status: "planned" }).where(eq(ordersTable.id, order.id));
      }
      return null;
    }

    const addrs = await tx.select().from(customerAddressesTable)
      .where(and(eq(customerAddressesTable.customerId, order.customerId), eq(customerAddressesTable.isDeliveryAddress, true)));
    const defaultAddr = addrs.find(a => a.isDefault) ?? addrs[0];
    if (!defaultAddr) return null;

    let delivery: typeof deliveriesTable.$inferSelect | undefined;
    let lastErr: any;
    for (let attempt = 0; attempt < 3 && !delivery; attempt++) {
      const deliveryNumber = await nextDeliveryNumberInTx(tx);
      try {
        const [row] = await tx.insert(deliveriesTable).values({
          deliveryNumber,
          orderId: order.id,
          customerId: order.customerId,
          deliveryAddressId: defaultAddr.id,
          driverId: null,
          scheduledDate: order.requestedDeliveryDate,
          plannedByUserId: userId,
          status: "unassigned",
          urgency: order.urgency,
          businessChannel: order.businessChannel,
        }).returning();
        delivery = row;
      } catch (err: any) {
        lastErr = err;
        if (err?.code !== "23505") throw err; // not a unique-violation, abort
      }
    }
    if (!delivery) throw lastErr ?? new Error("Could not allocate delivery number");

    await tx.update(ordersTable).set({ status: "planned" }).where(eq(ordersTable.id, order.id));
    return delivery;
  });

  if (result) {
    await logActivity({
      actionType: "delivery_created",
      entityType: "delivery",
      entityId: result.id,
      description: `Delivery ${result.deliveryNumber} auto-created for order ${order.orderNumber ?? `#${order.id}`}`,
      performedBy: userId,
    });
  }
}

async function nextOrderNumber(): Promise<string> {
  // Atomic-ish: parse highest existing ORD-NNNN and add 1. Unique constraint on order_number
  // catches any race; caller may retry if needed.
  const rows = await db.execute<{ next: number }>(sql`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(order_number, '[^0-9]', '', 'g'), '')::int), 0) + 1 AS next
    FROM orders
  `);
  const n = Number((rows as any).rows?.[0]?.next ?? (rows as any)[0]?.next ?? 1);
  return `ORD-${String(n).padStart(4, "0")}`;
}

router.get("/orders", requireAuth as any, async (req, res): Promise<void> => {
  const qp = ListOrdersQueryParams.safeParse(req.query);
  const { status, customerId } = qp.success ? qp.data : {} as any;
  const search = (req.query as any).search as string | undefined;

  const orders = await db.select().from(ordersTable).orderBy(ordersTable.createdAt);
  const customerIds = [...new Set(orders.map(o => o.customerId))];
  const customers = customerIds.length > 0
    ? await db.select().from(customersTable).where(inArray(customersTable.id, customerIds))
    : [];
  const customerMap = Object.fromEntries(customers.map(c => [c.id, c.companyName]));

  const creatorIds = [...new Set(orders.filter(o => o.createdBy).map(o => o.createdBy!))];
  const creators = creatorIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, creatorIds))
    : [];
  const creatorMap = Object.fromEntries(creators.map(u => [u.id, u.fullName]));

  let filtered = orders;
  if (status) filtered = filtered.filter(o => o.status === status);
  if (customerId) filtered = filtered.filter(o => o.customerId === customerId);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(o =>
      (customerMap[o.customerId] ?? "").toLowerCase().includes(s) ||
      o.id.toString().includes(s) ||
      (o.orderNumber ?? "").toLowerCase().includes(s)
    );
  }

  res.json(filtered.map(o => serializeOrder(o, customerMap[o.customerId], o.createdBy ? creatorMap[o.createdBy] : null)));
});

router.post("/orders", requireAuth as any, async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = (req as any).user;
  const totalAmount = parsed.data.items.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0);
  const orderNumber = await nextOrderNumber();

  const [order] = await db.insert(ordersTable).values({
    orderNumber,
    customerId: parsed.data.customerId,
    businessChannel: parsed.data.businessChannel,
    orderSource: parsed.data.orderSource,
    requestedDeliveryDate: parsed.data.requestedDeliveryDate ?? null,
    urgency: parsed.data.urgency,
    notes: parsed.data.notes ?? null,
    status: "new",
    totalAmount: totalAmount.toString(),
    createdBy: user.id,
  }).returning();

  if (parsed.data.items.length > 0) {
    await db.insert(orderItemsTable).values(
      parsed.data.items.map(item => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceSnapshot: item.unitPriceSnapshot.toString(),
        lineTotal: (item.quantity * item.unitPriceSnapshot).toString(),
      }))
    );
  }

  // Allocate inventory for each item against the mapped pool
  let stockWarnings: ReturnType<typeof Array<{ productId: number; productName: string; requested: number; available: number; poolName: string }>> = [];
  if (parsed.data.items.length > 0) {
    const allocationItems = parsed.data.items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
    const result = await db.transaction(async (tx) => {
      return allocateStockForOrder(tx, order.id, parsed.data.orderSource, allocationItems, user.id);
    });
    stockWarnings = result.warnings;
  }

  // Evaluate completeness; auto-create unassigned delivery if valid
  const evaluatedStatus = await evaluateOrderCompleteness(order.id, order.customerId, order.requestedDeliveryDate);
  let finalOrder = order;
  if (evaluatedStatus === "incomplete") {
    [finalOrder] = await db.update(ordersTable).set({ status: "incomplete" }).where(eq(ordersTable.id, order.id)).returning();
    await logActivity({
      actionType: "order_incomplete",
      entityType: "order",
      entityId: order.id,
      description: `Order ${order.orderNumber} marked incomplete (missing items, address, or delivery date)`,
      performedBy: user.id,
    });
  } else {
    // Auto-create delivery (will set order.status = planned)
    await autoCreateDeliveryForOrder(order, user.id);
    [finalOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
  }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, finalOrder.customerId));
  await logActivity({
    actionType: "order_created",
    entityType: "order",
    entityId: finalOrder.id,
    description: `Order ${finalOrder.orderNumber} created for "${customer?.companyName}"`,
    performedBy: user.id,
  });

  res.status(201).json({ ...serializeOrder(finalOrder, customer?.companyName, user.fullName), stockWarnings });
});

router.post("/orders/:id/send-to-planning", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetOrderParams.safeParse({ id: rawId });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const user = (req as any).user;
  const evaluated = await evaluateOrderCompleteness(order.id, order.customerId, order.requestedDeliveryDate);
  if (evaluated === "incomplete") {
    res.status(409).json({ error: "Order is still incomplete (needs items, delivery date, and a delivery address)" });
    return;
  }

  await autoCreateDeliveryForOrder(order, user.id);
  const [updated] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, updated.customerId));

  await logActivity({
    actionType: "order_sent_to_planning",
    entityType: "order",
    entityId: order.id,
    description: `Order ${order.orderNumber} sent to delivery planning`,
    performedBy: user.id,
  });

  res.json(serializeOrder(updated, customer?.companyName, null));
});

router.get("/orders/:id", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetOrderParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  const productIds = [...new Set(items.map(i => i.productId))];
  const products = productIds.length > 0
    ? await db.select().from(productsTable).where(inArray(productsTable.id, productIds))
    : [];
  const productMap = Object.fromEntries(products.map(p => [p.id, p.productName]));

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, order.customerId));

  const serializedItems = items.map(i => ({
    ...i,
    productName: productMap[i.productId] ?? "Unknown",
    unitPriceSnapshot: parseFloat(i.unitPriceSnapshot),
    lineTotal: parseFloat(i.lineTotal),
    createdAt: i.createdAt.toISOString(),
  }));

  const serializedCustomer = customer ? {
    ...customer,
    discountLevel: customer.discountLevel ? parseFloat(customer.discountLevel) : null,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  } : null;

  res.json({
    ...serializeOrder(order, customer?.companyName, null),
    items: serializedItems,
    customer: serializedCustomer,
  });
});

router.patch("/orders/:id", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateOrderParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Fetch current order before updating so we can check prior status and approval fields
  const [currentOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!currentOrder) { res.status(404).json({ error: "Order not found" }); return; }

  const [order] = await db.update(ordersTable).set(parsed.data).where(eq(ordersTable.id, params.data.id)).returning();
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  // Handle cancellation: release (or flag) reserved stock
  if (parsed.data.status === "cancelled" && currentOrder.status !== "cancelled") {
    const user = (req as any).user;
    await db.transaction(async (tx) => {
      await releaseStockForOrder(tx, order.id, currentOrder.approvedAt, currentOrder.invoiceTriggeredAt, user.id);
    });
    await logActivity({
      actionType: "order_cancelled",
      entityType: "order",
      entityId: order.id,
      description: `Order ${order.orderNumber ?? `#${order.id}`} cancelled${currentOrder.approvedAt || currentOrder.invoiceTriggeredAt ? " — stock allocations flagged for manual review" : " — stock released"}`,
      performedBy: (req as any).user.id,
    });
  }

  // If currently incomplete, re-evaluate and possibly promote to "new"
  let finalOrder = order;
  if (order.status === "incomplete") {
    const evaluated = await evaluateOrderCompleteness(order.id, order.customerId, order.requestedDeliveryDate);
    if (evaluated === "new") {
      [finalOrder] = await db.update(ordersTable).set({ status: "new" }).where(eq(ordersTable.id, order.id)).returning();
    }
  }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, finalOrder.customerId));
  res.json(serializeOrder(finalOrder, customer?.companyName, null));
});

const ITEM_EDITABLE_STATUSES = new Set(["new", "incomplete"]);

router.post("/orders/:id/items", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetOrderParams.safeParse({ id: rawId });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = AddOrderItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const lineTotal = parsed.data.quantity * parsed.data.unitPriceSnapshot;
  const user = (req as any).user;

  let item: typeof orderItemsTable.$inferSelect | undefined;
  let order: typeof ordersTable.$inferSelect | undefined;

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${params.data.id})`);
      [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
      if (!order) throw new Error("NOT_FOUND");
      if (!ITEM_EDITABLE_STATUSES.has(order.status)) throw new Error(`NOT_EDITABLE:${order.status}`);

      [item] = await tx.insert(orderItemsTable).values({
        orderId: order.id,
        productId: parsed.data.productId,
        quantity: parsed.data.quantity,
        unitPriceSnapshot: parsed.data.unitPriceSnapshot.toString(),
        lineTotal: lineTotal.toString(),
      }).returning();

      const items = await tx.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
      const total = items.reduce((sum, i) => sum + parseFloat(i.lineTotal), 0);
      const evaluated = await evaluateOrderCompleteness(order.id, order.customerId, order.requestedDeliveryDate);
      const nextStatus = order.status === "incomplete" && evaluated === "new" ? "new" : order.status;
      await tx.update(ordersTable).set({ totalAmount: total.toString(), status: nextStatus }).where(eq(ordersTable.id, order.id));
    });
  } catch (err: any) {
    if (err?.message === "NOT_FOUND") { res.status(404).json({ error: "Order not found" }); return; }
    if (err?.message?.startsWith("NOT_EDITABLE:")) {
      res.status(409).json({ error: `Cannot edit items on a ${err.message.split(":")[1]} order` });
      return;
    }
    throw err;
  }

  await logActivity({
    actionType: "order_item_added",
    entityType: "order",
    entityId: order!.id,
    description: `Item added to order ${order!.orderNumber ?? `#${order!.id}`}`,
    performedBy: user.id,
  });

  res.status(201).json({
    ...item!,
    unitPriceSnapshot: parseFloat(item!.unitPriceSnapshot),
    lineTotal: parseFloat(item!.lineTotal),
    createdAt: item!.createdAt.toISOString(),
  });
});

router.delete("/orders/:id/items/:itemId", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rawItemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
  const parsed = DeleteOrderItemParams.safeParse({ id: rawId, itemId: rawItemId });
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const user = (req as any).user;
  let order: typeof ordersTable.$inferSelect | undefined;

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${parsed.data.id})`);
      [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, parsed.data.id));
      if (!order) throw new Error("NOT_FOUND");
      if (!ITEM_EDITABLE_STATUSES.has(order.status)) throw new Error(`NOT_EDITABLE:${order.status}`);

      const deleted = await tx
        .delete(orderItemsTable)
        .where(and(eq(orderItemsTable.id, parsed.data.itemId), eq(orderItemsTable.orderId, parsed.data.id)))
        .returning();
      if (deleted.length === 0) throw new Error("ITEM_NOT_FOUND");

      const items = await tx.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
      const total = items.reduce((sum, i) => sum + parseFloat(i.lineTotal), 0);
      const evaluated = await evaluateOrderCompleteness(order.id, order.customerId, order.requestedDeliveryDate);
      const nextStatus = order.status === "new" && evaluated === "incomplete" ? "incomplete" : order.status;
      await tx.update(ordersTable).set({ totalAmount: total.toString(), status: nextStatus }).where(eq(ordersTable.id, order.id));
    });
  } catch (err: any) {
    if (err?.message === "NOT_FOUND") { res.status(404).json({ error: "Order not found" }); return; }
    if (err?.message === "ITEM_NOT_FOUND") { res.status(404).json({ error: "Item not found" }); return; }
    if (err?.message?.startsWith("NOT_EDITABLE:")) {
      res.status(409).json({ error: `Cannot edit items on a ${err.message.split(":")[1]} order` });
      return;
    }
    throw err;
  }

  await logActivity({
    actionType: "order_item_removed",
    entityType: "order",
    entityId: order!.id,
    description: `Item removed from order ${order!.orderNumber ?? `#${order!.id}`}`,
    performedBy: user.id,
  });

  res.status(204).end();
});

export default router;
