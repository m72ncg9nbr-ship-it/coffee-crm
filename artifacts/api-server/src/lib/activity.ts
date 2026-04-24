import { db, activityLogsTable } from "@workspace/db";
import { logger } from "./logger";

interface LogActivityOptions {
  action: string;
  entityType: string;
  entityId?: number;
  description: string;
  performedBy?: number;
  metadata?: Record<string, unknown>;
}

export async function logActivity(opts: LogActivityOptions): Promise<void> {
  try {
    await db.insert(activityLogsTable).values({
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      description: opts.description,
      performedBy: opts.performedBy,
      metadata: opts.metadata ? JSON.stringify(opts.metadata) : undefined,
    });
  } catch (err) {
    logger.error({ err }, "Failed to log activity");
  }
}
