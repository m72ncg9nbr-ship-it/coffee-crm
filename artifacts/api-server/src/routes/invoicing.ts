import { Router, type IRouter } from "express";
import { db, ordersTable, customersTable, deliveriesTable, deliveryDocumentsTable, accountingApprovalsTable, usersTable, orderItemsTable, productsTable } from "@workspace/db";
import { eq, inArray, and, isNotNull, desc } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/invoicing/ready", requireRole("admin", "accounting") as any, async (_req, res): Promise<void> => {
  const orders = await db.select().from(ordersTable).where(
    and(eq(ordersTable.status, "approved"), isNotNull(ordersTable.invoiceTriggeredAt))
  ).orderBy(desc(ordersTable.invoiceTriggeredAt));

  if (orders.length === 0) { res.json([]); return; }

  const orderIds = orders.map(o => o.id);
  const customerIds = [...new Set(orders.map(o => o.customerId))];
  const approverIds = [...new Set(orders.filter(o => o.approvedByAccountingUserId).map(o => o.approvedByAccountingUserId!))];

  const [customers, deliveries, approvers, items] = await Promise.all([
    db.select().from(customersTable).where(inArray(customersTable.id, customerIds)),
    db.select().from(deliveriesTable).where(inArray(deliveriesTable.orderId, orderIds)),
    approverIds.length > 0
      ? db.select().from(usersTable).where(inArray(usersTable.id, approverIds))
      : Promise.resolve([] as typeof usersTable.$inferSelect[]),
    db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds)),
  ]);

  const deliveryIds = deliveries.map(d => d.id);
  const documents = deliveryIds.length > 0
    ? await db.select().from(deliveryDocumentsTable).where(inArray(deliveryDocumentsTable.deliveryId, deliveryIds))
    : [];

  const customerMap = Object.fromEntries(customers.map(c => [c.id, c]));
  const deliveryMap = Object.fromEntries(deliveries.map(d => [d.orderId, d]));
  const approverMap = Object.fromEntries(approvers.map(u => [u.id, u.fullName]));
  const docsByDelivery: Record<number, typeof deliveryDocumentsTable.$inferSelect[]> = {};
  documents.forEach(d => { (docsByDelivery[d.deliveryId] ||= []).push(d); });
  const itemsByOrder: Record<number, typeof orderItemsTable.$inferSelect[]> = {};
  items.forEach(i => { (itemsByOrder[i.orderId] ||= []).push(i); });

  res.json(orders.map(o => {
    const delivery = deliveryMap[o.id];
    const customer = customerMap[o.customerId];
    const docs = delivery ? (docsByDelivery[delivery.id] ?? []) : [];
    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      customerId: o.customerId,
      customerName: customer?.companyName ?? "Unknown",
      customerPriority: customer?.priorityClass ?? "C",
      totalAmount: parseFloat(o.totalAmount),
      requestedDeliveryDate: o.requestedDeliveryDate,
      scheduledDeliveryDate: delivery?.scheduledDate ?? null,
      deliveryNumber: delivery?.deliveryNumber ?? null,
      deliveryId: delivery?.id ?? null,
      approvedAt: o.approvedAt?.toISOString() ?? null,
      invoiceTriggeredAt: o.invoiceTriggeredAt?.toISOString() ?? null,
      approvedByName: o.approvedByAccountingUserId ? (approverMap[o.approvedByAccountingUserId] ?? null) : null,
      itemCount: (itemsByOrder[o.id] ?? []).length,
      documents: docs.map(d => ({
        id: d.id,
        documentType: d.documentType,
        fileUrl: d.fileUrl,
        createdAt: d.createdAt.toISOString(),
      })),
    };
  }));
});

export default router;
