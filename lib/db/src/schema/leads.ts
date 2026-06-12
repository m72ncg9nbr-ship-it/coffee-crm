import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  contactPerson: text("contact_person").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  businessChannel: text("business_channel").notNull(),
  businessType: text("business_type").notNull(),
  estimatedMonthlyConsumption: text("estimated_monthly_consumption"),
  preferredCoffeeType: text("preferred_coffee_type"),
  requestedMachineType: text("requested_machine_type"),
  requestedPaymentTerms: text("requested_payment_terms"),
  extraNotes: text("extra_notes"),
  qualificationResult: text("qualification_result"),
  qualificationReason: text("qualification_reason"),
  status: text("status").notNull().default("new"),
  followUpDueAt: timestamp("follow_up_due_at", { withTimezone: true }),
  followUpCompletedAt: timestamp("follow_up_completed_at", { withTimezone: true }),
  createdBy: integer("created_by").references(() => usersTable.id),
  region: text("region"),
  importance: text("importance").notNull().default("normal"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
