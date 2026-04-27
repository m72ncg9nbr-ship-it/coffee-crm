import { Router, type IRouter } from "express";
import { db, leadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { CreateLeadBody, GetLeadParams, UpdateLeadParams, UpdateLeadBody } from "@workspace/api-zod";
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
