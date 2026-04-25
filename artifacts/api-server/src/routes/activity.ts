import { Router, type IRouter } from "express";
import { db, activityLogsTable, usersTable } from "@workspace/db";
import { eq, inArray, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { ListActivityLogsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/activity-logs", requireAuth as any, async (req, res): Promise<void> => {
  const qp = ListActivityLogsQueryParams.safeParse(req.query);
  const { limit, entityType, entityId } = qp.success ? qp.data : {} as any;

  let baseQ = db.select().from(activityLogsTable).$dynamic();
  const conds = [] as any[];
  if (entityType) conds.push(eq(activityLogsTable.entityType, entityType as string));
  if (entityId) conds.push(eq(activityLogsTable.entityId, Number(entityId)));
  if (conds.length > 0) {
    baseQ = baseQ.where(conds.length === 1 ? conds[0] : (await import("drizzle-orm")).and(...conds)!);
  }

  const logs = await baseQ
    .orderBy(desc(activityLogsTable.createdAt))
    .limit(limit ? Number(limit) : 100);

  const performerIds = [...new Set(logs.filter(l => l.performedBy).map(l => l.performedBy!))];
  const performers = performerIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, performerIds))
    : [];
  const performerMap = Object.fromEntries(performers.map(u => [u.id, u.fullName]));

  res.json(logs.map(l => ({
    ...l,
    performedByName: l.performedBy ? (performerMap[l.performedBy] ?? null) : null,
    createdAt: l.createdAt.toISOString(),
  })));
});

export default router;
