import { db, activityLogsTable } from "@workspace/db";
import { logger } from "./logger";

interface LogActivityOptions {
  actionType: string;
  actionLabel?: string;
  entityType: string;
  entityId?: number;
  description: string;
  performedBy?: number;
  metadata?: Record<string, unknown>;
}

const ACTION_LABELS: Record<string, string> = {
  order_created: "Order Created",
  order_updated: "Order Updated",
  delivery_created: "Delivery Created",
  delivery_assigned: "Delivery Assigned",
  driver_arrived: "Driver Arrived",
  documentation_uploaded: "Documents Uploaded",
  accounting_approved: "Accounting Approved",
  accounting_rejected: "Accounting Rejected",
  invoice_triggered: "Invoice Triggered",
  customer_created: "Customer Created",
  customer_updated: "Customer Updated",
  customer_priority_changed: "Priority Changed",
  lead_created: "Lead Submitted",
  lead_converted: "Lead Converted",
};

export async function logActivity(opts: LogActivityOptions): Promise<void> {
  try {
    await db.insert(activityLogsTable).values({
      actionType: opts.actionType,
      actionLabel: opts.actionLabel ?? ACTION_LABELS[opts.actionType] ?? opts.actionType,
      entityType: opts.entityType,
      entityId: opts.entityId,
      description: opts.description,
      performedBy: opts.performedBy,
      metadataJson: opts.metadata ? JSON.stringify(opts.metadata) : undefined,
    });
  } catch (err) {
    logger.error({ err }, "Failed to log activity");
  }
}
