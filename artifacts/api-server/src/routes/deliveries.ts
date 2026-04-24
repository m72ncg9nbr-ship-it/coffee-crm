import { Router, type IRouter } from "express";
import { db, deliveriesTable, deliveryDocumentsTable, accountingApprovalsTable, ordersTable, customersTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logActivity } from "../lib/activity";
import {
  CreateDeliveryBody,
  UpdateDeliveryBody,
  GetDeliveryParams,
  UpdateDeliveryParams,
  ListDeliveriesQueryParams,
  UploadDeliveryDocumentParams,
  UploadDeliveryDocumentBody,
  GetDriverDeliveriesParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function enrichDeliveries(deliveries: (typeof deliveriesTable.$inferSelect)[]) {
  if (deliveries.length === 0) return [];

  const customerIds = [...new Set(deliveries.map(d => d.customerId))];
  const driverIds = [...new Set(deliveries.filter(d => d.driverId).map(d => d.driverId!))];

  const customers = customerIds.length > 0
    ? await db.select().from(customersTable).where(inArray(customersTable.id, customerIds))
    : [];
  const drivers = driverIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, driverIds))
    : [];

  const customerMap = Object.fromEntries(customers.map(c => [c.id, { name: c.companyName, priority: c.priorityClass }]));
  const driverMap = Object.fromEntries(drivers.map(u => [u.id, u.fullName]));

  return deliveries.map(d => ({
    ...d,
    customerName: customerMap[d.customerId]?.name ?? "Unknown",
    customerPriority: customerMap[d.customerId]?.priority ?? "C",
    driverName: d.driverId ? (driverMap[d.driverId] ?? null) : null,
    invoiceTriggeredAt: d.invoiceTriggeredAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));
}

router.get("/deliveries", requireAuth as any, async (req, res): Promise<void> => {
  const qp = ListDeliveriesQueryParams.safeParse(req.query);
  const { status, driverId, dateRange, channel } = qp.success ? qp.data : {} as any;

  let query = db.select().from(deliveriesTable).$dynamic();
  const conditions = [];

  if (status) {
    conditions.push(eq(deliveriesTable.status, status as string));
  }
  if (driverId) {
    conditions.push(eq(deliveriesTable.driverId, Number(driverId)));
  }
  if (channel) {
    conditions.push(eq(deliveriesTable.businessChannel, channel as string));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const deliveries = await query.orderBy(deliveriesTable.scheduledDate, deliveriesTable.createdAt);
  const enriched = await enrichDeliveries(deliveries);
  res.json(enriched);
});

router.post("/deliveries", requireAuth as any, async (req, res): Promise<void> => {
  const parsed = CreateDeliveryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = (req as any).user;
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, parsed.data.orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const [delivery] = await db.insert(deliveriesTable).values({
    orderId: parsed.data.orderId,
    customerId: order.customerId,
    driverId: parsed.data.driverId ?? null,
    scheduledDate: parsed.data.scheduledDate ?? null,
    status: parsed.data.driverId ? "assigned" : "unassigned",
    urgency: order.urgency,
    businessChannel: order.businessChannel,
  }).returning();

  await logActivity({
    action: "delivery_created",
    entityType: "delivery",
    entityId: delivery.id,
    description: `Delivery #${delivery.id} created for order #${order.id}`,
    performedBy: user.id,
  });

  const enriched = await enrichDeliveries([delivery]);
  res.status(201).json(enriched[0]);
});

router.get("/deliveries/driver/:driverId", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.driverId) ? req.params.driverId[0] : req.params.driverId;
  const params = GetDriverDeliveriesParams.safeParse({ driverId: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deliveries = await db.select().from(deliveriesTable)
    .where(and(
      eq(deliveriesTable.driverId, params.data.driverId),
      inArray(deliveriesTable.status, ["assigned", "in_transit", "arrived"])
    ))
    .orderBy(deliveriesTable.scheduledDate);

  const enriched = await enrichDeliveries(deliveries);
  res.json(enriched);
});

router.get("/deliveries/:id", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetDeliveryParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, params.data.id));
  if (!delivery) {
    res.status(404).json({ error: "Delivery not found" });
    return;
  }

  const documents = await db.select().from(deliveryDocumentsTable).where(eq(deliveryDocumentsTable.deliveryId, delivery.id));
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, delivery.orderId));
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, delivery.customerId));

  const enriched = await enrichDeliveries([delivery]);
  const base = enriched[0];

  const uploader_ids = [...new Set(documents.filter(d => d.uploadedBy).map(d => d.uploadedBy!))];
  const uploaders = uploader_ids.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, uploader_ids))
    : [];
  const uploaderMap = Object.fromEntries(uploaders.map(u => [u.id, u.fullName]));

  const enrichedDocs = documents.map(d => ({
    ...d,
    uploadedByName: d.uploadedBy ? (uploaderMap[d.uploadedBy] ?? null) : null,
    createdAt: d.createdAt.toISOString(),
  }));

  res.json({
    ...base,
    documents: enrichedDocs,
    order: order ? {
      ...order,
      totalAmount: parseFloat(order.totalAmount),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      customerName: customer?.companyName ?? "Unknown",
      createdByName: null,
    } : null,
    customer: customer ? {
      ...customer,
      discountLevel: customer.discountLevel ? parseFloat(customer.discountLevel) : null,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    } : null,
  });
});

router.patch("/deliveries/:id", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateDeliveryParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateDeliveryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = (req as any).user;
  const [delivery] = await db.update(deliveriesTable)
    .set(parsed.data)
    .where(eq(deliveriesTable.id, params.data.id))
    .returning();

  if (!delivery) {
    res.status(404).json({ error: "Delivery not found" });
    return;
  }

  if (parsed.data.driverId) {
    await logActivity({
      action: "delivery_assigned",
      entityType: "delivery",
      entityId: delivery.id,
      description: `Delivery #${delivery.id} assigned to driver`,
      performedBy: user.id,
    });
  }

  if (parsed.data.status === "arrived") {
    await logActivity({
      action: "driver_arrived",
      entityType: "delivery",
      entityId: delivery.id,
      description: `Driver arrived for delivery #${delivery.id}`,
      performedBy: user.id,
    });
  }

  const enriched = await enrichDeliveries([delivery]);
  res.json(enriched[0]);
});

router.post("/deliveries/:id/documents", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UploadDeliveryDocumentParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UploadDeliveryDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = (req as any).user;

  const [doc] = await db.insert(deliveryDocumentsTable).values({
    deliveryId: params.data.id,
    documentType: parsed.data.documentType,
    fileUrl: parsed.data.fileUrl,
    notes: parsed.data.notes ?? null,
    uploadedBy: user.id,
  }).returning();

  await db.update(deliveriesTable)
    .set({
      hasDocument: true,
      status: "awaiting_accounting_approval",
      deviationType: parsed.data.deviationType ?? null,
      deviationNote: parsed.data.deviationNote ?? null,
    })
    .where(eq(deliveriesTable.id, params.data.id));

  await accountingApprovalsTable && await db.insert(accountingApprovalsTable).values({
    deliveryId: params.data.id,
    status: "pending",
  }).onConflictDoNothing();

  await logActivity({
    action: "documentation_uploaded",
    entityType: "delivery",
    entityId: params.data.id,
    description: `Delivery proof uploaded for delivery #${params.data.id}`,
    performedBy: user.id,
  });

  res.status(201).json({
    ...doc,
    uploadedByName: user.fullName,
    createdAt: doc.createdAt.toISOString(),
  });
});

export default router;
