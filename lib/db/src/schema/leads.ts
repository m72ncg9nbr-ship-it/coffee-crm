import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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
  qualificationStatus: text("qualification_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
