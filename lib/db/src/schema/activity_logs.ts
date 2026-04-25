import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const activityLogsTable = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  actionType: text("action_type").notNull(),
  actionLabel: text("action_label"),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  description: text("description").notNull(),
  performedBy: integer("performed_by").references(() => usersTable.id),
  metadataJson: text("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogsTable).omit({ id: true, createdAt: true });
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogsTable.$inferSelect;
