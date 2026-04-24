import { Router, type IRouter } from "express";
import { db, activityLogsTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { ListActivityLogsQueryParams } from "@workspace/api-zod";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/activity-logs", requireAuth as any, async (req, res): Promise<void> => {
  const qp = ListActivityLogsQueryParams.safeParse(req.query);
  const { limit, entityType, entityId } = qp.success ? qp.data : {} as any;

  let query = db.select().from(activityLogsTable).$dynamic();
  const conditions = [];

  if (entityType) {
    conditions.push(eq(activityLogsTable.entityType, entityType as string));
  }
  if (entityId) {
    conditions.push(eq(activityLogsTable.entityId, Number(entityId)));
  }

  const logs = await db.select()
    .from(activityLogsTable)
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
