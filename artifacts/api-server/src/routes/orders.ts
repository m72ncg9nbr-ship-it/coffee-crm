import { Router, type IRouter } from "express";
import { db, ordersTable, orderItemsTable, customersTable, usersTable, productsTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logActivity } from "../lib/activity";
import {
  CreateOrderBody,
  UpdateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  ListOrdersQueryParams,
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

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, order.customerId));
  await logActivity({
    actionType: "order_created",
    entityType: "order",
    entityId: order.id,
    description: `Order ${order.orderNumber} created for "${customer?.companyName}"`,
    performedBy: user.id,
  });

  res.status(201).json(serializeOrder(order, customer?.companyName, user.fullName));
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

  const [order] = await db.update(ordersTable).set(parsed.data).where(eq(ordersTable.id, params.data.id)).returning();
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, order.customerId));
  res.json(serializeOrder(order, customer?.companyName, null));
});

export default router;
