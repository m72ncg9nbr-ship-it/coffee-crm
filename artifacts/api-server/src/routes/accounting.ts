import { Router, type IRouter } from "express";
import { db, accountingApprovalsTable, deliveriesTable, ordersTable, customersTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logActivity } from "../lib/activity";
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

  const deliveryIds = approvals.map(a => a.deliveryId);
  const deliveries = await db.select().from(deliveriesTable).where(inArray(deliveriesTable.id, deliveryIds));

  const customerIds = [...new Set(deliveries.map(d => d.customerId))];
  const customers = customerIds.length > 0
    ? await db.select().from(customersTable).where(inArray(customersTable.id, customerIds))
    : [];

  const reviewerIds = [...new Set(approvals.filter(a => a.reviewedBy).map(a => a.reviewedBy!))];
  const reviewers = reviewerIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, reviewerIds))
    : [];

  const deliveryMap = Object.fromEntries(deliveries.map(d => [d.id, d]));
  const customerMap = Object.fromEntries(customers.map(c => [c.id, { name: c.companyName, priority: c.priorityClass }]));
  const reviewerMap = Object.fromEntries(reviewers.map(u => [u.id, u.fullName]));

  return approvals.map(a => {
    const delivery = deliveryMap[a.deliveryId];
    const customer = delivery ? customerMap[delivery.customerId] : null;
    return {
      ...a,
      deliveryNumber: delivery?.deliveryNumber ?? null,
      customerName: customer?.name ?? "Unknown",
      customerPriority: customer?.priority ?? "C",
      reviewedByName: a.reviewedBy ? (reviewerMap[a.reviewedBy] ?? null) : null,
      invoiceTriggeredAt: a.invoiceTriggeredAt?.toISOString() ?? null,
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

router.post("/accounting/approvals/:deliveryId/approve", requireRole("admin", "accounting") as any, async (req, res): Promise<void> => {
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

  // Update the linked order
  if (delivery) {
    await db.update(ordersTable)
      .set({
        status: "approved",
        approvedByAccountingUserId: user.id,
        approvedAt: now,
        invoiceTriggeredAt: now,
      })
      .where(eq(ordersTable.id, delivery.orderId));
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

router.post("/accounting/approvals/:deliveryId/reject", requireRole("admin", "accounting") as any, async (req, res): Promise<void> => {
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
