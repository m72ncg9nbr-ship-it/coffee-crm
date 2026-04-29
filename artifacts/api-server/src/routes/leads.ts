import { Router, type IRouter } from "express";
import { db, leadsTable, customersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  CreateLeadBody,
  GetLeadParams,
  UpdateLeadParams,
  UpdateLeadBody,
  ConvertLeadBody,
} from "@workspace/api-zod";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

function qualifyLead(data: {
  estimatedMonthlyConsumption?: string | null;
  businessType?: string;
}): { status: string; result: string; reason: string } {
  const consumption = parseInt(data.estimatedMonthlyConsumption ?? "0", 10);
  if (consumption >= 50) {
    return {
      status: "qualified",
      result: "auto_qualified",
      reason: `Monthly consumption ${consumption}kg meets qualification threshold (>= 50kg).`,
    };
  }
  return {
    status: "manual_review",
    result: "needs_review",
    reason: `Monthly consumption ${consumption}kg below auto-qualify threshold; requires sales review.`,
  };
}

router.get("/leads", requireAuth as any, async (req, res): Promise<void> => {
  const leads = await db.select().from(leadsTable).orderBy(leadsTable.createdAt);
  res.json(leads.map(l => ({
    ...l,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    followUpDueAt: l.followUpDueAt?.toISOString() ?? null,
    followUpCompletedAt: l.followUpCompletedAt?.toISOString() ?? null,
  })));
});

router.post("/leads", requireAuth as any, async (req, res): Promise<void> => {
  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const q = qualifyLead({
    estimatedMonthlyConsumption: parsed.data.estimatedMonthlyConsumption,
    businessType: parsed.data.businessType,
  });

  const user = (req as any).user;
  const followUpDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [lead] = await db.insert(leadsTable).values({
    ...parsed.data,
    status: q.status,
    qualificationResult: q.result,
    qualificationReason: q.reason,
    followUpDueAt,
  }).returning();

  await logActivity({
    actionType: "lead_created",
    entityType: "lead",
    entityId: lead.id,
    description: `Lead from "${lead.companyName}" submitted — status: ${q.status}`,
    performedBy: user?.id,
  });

  res.status(201).json({
    ...lead,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    followUpDueAt: lead.followUpDueAt?.toISOString() ?? null,
    followUpCompletedAt: lead.followUpCompletedAt?.toISOString() ?? null,
  });
});

router.get("/leads/:id", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetLeadParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, params.data.id));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  res.json({
    ...lead,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  });
});

router.post("/leads/:id/convert", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetLeadParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ConvertLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, params.data.id));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (lead.status === "converted_to_customer") {
    res.status(409).json({ error: "Lead has already been converted" });
    return;
  }

  const user = (req as any).user;
  const channel = parsed.data.businessChannel ?? parsed.data.customerChannel ?? lead.businessChannel;

  const insertValues = {
    companyName: parsed.data.companyName ?? lead.companyName,
    contactPerson: parsed.data.contactPerson ?? lead.contactPerson,
    phone: parsed.data.phone ?? lead.phone,
    email: parsed.data.email ?? lead.email,
    customerChannel: parsed.data.customerChannel ?? channel,
    businessChannel: parsed.data.businessChannel ?? channel,
    segment: parsed.data.segment,
    priorityClass: parsed.data.priorityClass,
    paymentTerms: parsed.data.paymentTerms,
    discountLevel:
      parsed.data.discountLevel === undefined || parsed.data.discountLevel === null
        ? null
        : parsed.data.discountLevel.toString(),
    notes: parsed.data.notes ?? lead.extraNotes ?? null,
    createdByUserId: user.id,
  };

  const [customer] = await db.insert(customersTable).values(insertValues).returning();

  await db
    .update(leadsTable)
    .set({ status: "converted_to_customer" })
    .where(eq(leadsTable.id, lead.id));

  await logActivity({
    actionType: "lead_converted",
    entityType: "lead",
    entityId: lead.id,
    description: `Lead "${lead.companyName}" converted to customer #${customer.id}`,
    performedBy: user.id,
  });

  await logActivity({
    actionType: "customer_created",
    entityType: "customer",
    entityId: customer.id,
    description: `Customer "${customer.companyName}" created from lead #${lead.id}`,
    performedBy: user.id,
  });

  res.status(201).json({
    ...customer,
    discountLevel: customer.discountLevel ? parseFloat(customer.discountLevel) : null,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  });
});

router.patch("/leads/:id", requireAuth as any, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateLeadParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [lead] = await db.update(leadsTable).set(parsed.data).where(eq(leadsTable.id, params.data.id)).returning();
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  res.json({
    ...lead,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  });
});

export default router;
