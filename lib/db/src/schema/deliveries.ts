import { pgTable, text, serial, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { customersTable, customerAddressesTable } from "./customers";
import { usersTable } from "./users";

export const deliveriesTable = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  deliveryNumber: text("delivery_number").unique(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  deliveryAddressId: integer("delivery_address_id").references(() => customerAddressesTable.id),
  driverId: integer("driver_id").references(() => usersTable.id),
  scheduledDate: text("scheduled_date"),
  plannedSequence: integer("planned_sequence"),
  plannedByUserId: integer("planned_by_user_id").references(() => usersTable.id),
  status: text("status").notNull().default("unassigned"),
  urgency: text("urgency").notNull().default("normal"),
  businessChannel: text("business_channel").notNull(),
  deviationType: text("deviation_type"),
  deviationNote: text("deviation_note"),
  hasDocument: boolean("has_document").notNull().default(false),
  arrivalMarkedAt: timestamp("arrival_marked_at", { withTimezone: true }),
  documentationUploadedAt: timestamp("documentation_uploaded_at", { withTimezone: true }),
  invoiceTriggered: boolean("invoice_triggered").notNull().default(false),
  invoiceTriggeredAt: timestamp("invoice_triggered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const deliveryDocumentsTable = pgTable("delivery_documents", {
  id: serial("id").primaryKey(),
  deliveryId: integer("delivery_id").notNull().references(() => deliveriesTable.id),
  documentType: text("document_type").notNull(),
  fileUrl: text("file_url").notNull(),
  notes: text("notes"),
  uploadedBy: integer("uploaded_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountingApprovalsTable = pgTable("accounting_approvals", {
  id: serial("id").primaryKey(),
  deliveryId: integer("delivery_id").notNull().unique().references(() => deliveriesTable.id),
  orderId: integer("order_id").references(() => ordersTable.id),
  status: text("status").notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewNotes: text("review_notes"),
  invoiceTriggered: boolean("invoice_triggered").notNull().default(false),
  invoiceTriggeredAt: timestamp("invoice_triggered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDeliverySchema = createInsertSchema(deliveriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDeliveryDocumentSchema = createInsertSchema(deliveryDocumentsTable).omit({ id: true, createdAt: true });
export const insertAccountingApprovalSchema = createInsertSchema(accountingApprovalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type Delivery = typeof deliveriesTable.$inferSelect;
export type DeliveryDocument = typeof deliveryDocumentsTable.$inferSelect;
export type AccountingApproval = typeof accountingApprovalsTable.$inferSelect;
