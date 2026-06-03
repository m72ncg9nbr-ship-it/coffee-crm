import { Router, type IRouter } from "express";
import { db, accountingApprovalsTable, deliveriesTable, ordersTable, customersTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth, requireRole, FULL_ACCESS_ACCOUNTING } from "../middlewares/auth";
import { logActivity } from "../lib/activity";
import { fulfillStockForOrder } from "../lib/inventory";
import { parsePaymentTermsDays, addDaysToDateStr } from "../lib/paymentTerms";
import {
  ListAccountingApprovalsQueryParams,
  ApproveDeliveryParams,
  ApproveDeliveryBody,
  RejectDeliveryParams,
  RejectDeliveryBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function enrichApprovals(approvals: (typeof accountingApprovalsTable.$inferSelect)[]) {
  if (approvals.length === 0) return [];

  const { orderItemsTable, productsTable, deliveryDocumentsTable } = await import("@workspace/db");

  const deliveryIds = approvals.map(a => a.deliveryId);
  const deliveries = await db.select().from(deliveriesTable).where(inArray(deliveriesTable.id, deliveryIds));

  const customerIds = [...new Set(deliveries.map(d => d.customerId))];
  const customers = customerIds.length > 0
    ? await db.select().from(customersTable).where(inArray(customersTable.id, customerIds))
    : [];

  const orderIds = [...new Set(deliveries.map(d => d.orderId).filter(Boolean) as number[])];
  const orders = orderIds.length > 0
    ? await db.select().from(ordersTable).where(inArray(ordersTable.id, orderIds))
    : [];

  const driverIds = [...new Set(deliveries.map(d => d.driverId).filter(Boolean) as number[])];
  const drivers = driverIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, driverIds))
    : [];

  const items = orderIds.length > 0
    ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds))
    : [];
  const productIds = [...new Set(items.map(i => i.productId))];
  const products = productIds.length > 0
    ? await db.select().from(productsTable).where(inArray(productsTable.id, productIds))
    : [];
  const productNameMap = Object.fromEntries(products.map(p => [p.id, p.productName]));

  const documents = deliveryIds.length > 0
    ? await db.select().from(deliveryDocumentsTable).where(inArray(deliveryDocumentsTable.deliveryId, deliveryIds))
    : [];

  const reviewerIds = [...new Set(approvals.filter(a => a.reviewedBy).map(a => a.reviewedBy!))];
  const reviewers = reviewerIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, reviewerIds))
    : [];

  const deliveryMap = Object.fromEntries(deliveries.map(d => [d.id, d]));
  const customerMap = Object.fromEntries(customers.map(c => [c.id, { name: c.companyName, priority: c.priorityClass }]));
  const orderMap = Object.fromEntries(orders.map(o => [o.id, o]));
  const driverMap = Object.fromEntries(drivers.map(u => [u.id, u.fullName]));
  const reviewerMap = Object.fromEntries(reviewers.map(u => [u.id, u.fullName]));
  const itemsByOrder = items.reduce<Record<number, typeof items>>((acc, i) => {
    (acc[i.orderId] ??= []).push(i);
    return acc;
  }, {});
  const docByDelivery = Object.fromEntries(documents.map(d => [d.deliveryId, d]));

  return approvals.map(a => {
    const delivery = deliveryMap[a.deliveryId];
    const customer = delivery ? customerMap[delivery.customerId] : null;
    const order = a.orderId ? orderMap[a.orderId] : null;
    const orderItems = a.orderId ? (itemsByOrder[a.orderId] ?? []) : [];
    const doc = docByDelivery[a.deliveryId];
    return {
      ...a,
      deliveryNumber: delivery?.deliveryNumber ?? null,
      customerName: customer?.name ?? "Unknown",
      customerPriority: customer?.priority ?? "C",
      orderNumber: order?.orderNumber ?? null,
      orderTotalAmount: order ? parseFloat(order.totalAmount) : null,
      invoiceDate: order?.invoiceDate ?? null,
      dueDate: order?.dueDate ?? null,
      paymentStatus: order?.paymentStatus ?? null,
      paidAt: order?.paidAt ? (order.paidAt as Date).toISOString() : null,
      orderItems: orderItems.map(i => ({
        productName: productNameMap[i.productId] ?? "Unknown",
        quantity: i.quantity,
        lineTotal: parseFloat(i.lineTotal),
      })),
      driverName: delivery?.driverId ? (driverMap[delivery.driverId] ?? null) : null,
      scheduledDate: delivery?.scheduledDate ?? null,
      hasDocument: !!doc,
      documentUrl: doc?.fileUrl ?? null,
      deviationType: delivery?.deviationType ?? null,
      deviationNote: delivery?.deviationNote ?? null,
      reviewedByName: a.reviewedBy ? (reviewerMap[a.reviewedBy] ?? null) : null,
      invoiceTriggeredAt: a.invoiceTriggeredAt?.toISOString() ?? null,
      reviewedAt: a.reviewedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    };
  });
}

router.get("/accounting/approvals", requireAuth as any, async (req, res): Promise<void> => {
  const qp = ListAccountingApprovalsQueryParams.safeParse(req.query);
  const { status } = qp.success ? qp.data : {} as any;

  let query = db.select().from(accountingApprovalsTable).$dynamic();
  if (status) query = query.where(eq(accountingApprovalsTable.status, status as string));

  const approvals = await query.orderBy(accountingApprovalsTable.createdAt);
  res.json(await enrichApprovals(approvals));
});

router.post("/accounting/approvals/:deliveryId/approve", requireRole(...FULL_ACCESS_ACCOUNTING) as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.deliveryId) ? req.params.deliveryId[0] : req.params.deliveryId;
  const params = ApproveDeliveryParams.safeParse({ deliveryId: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ApproveDeliveryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = (req as any).user;
  const now = new Date();

  const [existing] = await db.select().from(accountingApprovalsTable)
    .where(eq(accountingApprovalsTable.deliveryId, params.data.deliveryId));
  if (!existing) {
    res.status(404).json({ error: "Approval record not found" });
    return;
  }
  if (existing.status !== "pending") {
    res.status(409).json({ error: `Approval already ${existing.status}` });
    return;
  }

  const [approval] = await db.update(accountingApprovalsTable)
    .set({
      status: "approved",
      reviewedBy: user.id,
      reviewedAt: now,
      reviewNotes: parsed.data.reviewNotes ?? null,
      invoiceTriggered: true,
      invoiceTriggeredAt: now,
    })
    .where(eq(accountingApprovalsTable.deliveryId, params.data.deliveryId))
    .returning();

  // Update delivery
  const [delivery] = await db.update(deliveriesTable)
    .set({ status: "approved", invoiceTriggered: true, invoiceTriggeredAt: now })
    .where(eq(deliveriesTable.id, params.data.deliveryId))
    .returning();

  // Update the linked order and fulfil inventory reservations
  if (delivery) {
    // V2.5: compute invoiceDate / dueDate from actual delivery date
    const invoiceDateStr =
      delivery.arrivalMarkedAt
        ? delivery.arrivalMarkedAt.toISOString().split("T")[0]
        : delivery.scheduledDate ?? now.toISOString().split("T")[0];

    const [orderCustomer] = await db.select({ paymentTerms: customersTable.paymentTerms })
      .from(customersTable)
      .where(
        eq(customersTable.id, delivery.customerId)
      );
    const ptDays = parsePaymentTermsDays(orderCustomer?.paymentTerms);
    const dueDateStr = addDaysToDateStr(invoiceDateStr, ptDays);

    await db.update(ordersTable)
      .set({
        status: "approved",
        approvedByAccountingUserId: user.id,
        approvedAt: now,
        invoiceTriggeredAt: now,
        invoiceDate: invoiceDateStr,
        dueDate: dueDateStr,
        paymentTermsDays: ptDays,
        paymentStatus: "unpaid",
      })
      .where(eq(ordersTable.id, delivery.orderId));

    // Convert reserved stock → fulfilled (drains quantityReserved)
    try {
      await fulfillStockForOrder(db, delivery.orderId, user.id);
    } catch (err) {
      console.error(`[inventory] fulfillStockForOrder failed for order ${delivery.orderId}:`, err);
    }
  }

  await logActivity({
    actionType: "accounting_approved",
    entityType: "delivery",
    entityId: params.data.deliveryId,
    description: `Delivery ${delivery?.deliveryNumber ?? `#${params.data.deliveryId}`} approved by accounting`,
    performedBy: user.id,
  });

  await logActivity({
    actionType: "invoice_triggered",
    entityType: "delivery",
    entityId: params.data.deliveryId,
    description: `Invoice triggered for delivery ${delivery?.deliveryNumber ?? `#${params.data.deliveryId}`}`,
    performedBy: user.id,
  });

  const enriched = await enrichApprovals([approval]);
  res.json(enriched[0]);
});

router.post("/accounting/approvals/:deliveryId/reject", requireRole(...FULL_ACCESS_ACCOUNTING) as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.deliveryId) ? req.params.deliveryId[0] : req.params.deliveryId;
  const params = RejectDeliveryParams.safeParse({ deliveryId: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = RejectDeliveryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = (req as any).user;

  const [existing] = await db.select().from(accountingApprovalsTable)
    .where(eq(accountingApprovalsTable.deliveryId, params.data.deliveryId));
  if (!existing) {
    res.status(404).json({ error: "Approval record not found" });
    return;
  }
  if (existing.status !== "pending") {
    res.status(409).json({ error: `Approval already ${existing.status}` });
    return;
  }

  const [approval] = await db.update(accountingApprovalsTable)
    .set({
      status: "rejected",
      reviewedBy: user.id,
      reviewedAt: new Date(),
      reviewNotes: parsed.data.reviewNotes,
    })
    .where(eq(accountingApprovalsTable.deliveryId, params.data.deliveryId))
    .returning();

  await db.update(deliveriesTable)
    .set({ status: "issue_reported" })
    .where(eq(deliveriesTable.id, params.data.deliveryId));

  await logActivity({
    actionType: "accounting_rejected",
    entityType: "delivery",
    entityId: params.data.deliveryId,
    description: `Delivery #${params.data.deliveryId} rejected by accounting: ${parsed.data.reviewNotes}`,
    performedBy: user.id,
  });

  const enriched = await enrichApprovals([approval]);
  res.json(enriched[0]);
});

export default router;
