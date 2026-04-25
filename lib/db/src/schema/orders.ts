import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { usersTable } from "./users";
import { productsTable } from "./products";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").unique(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  businessChannel: text("business_channel").notNull(),
  orderSource: text("order_source").notNull().default("phone"),
  requestedDeliveryDate: text("requested_delivery_date"),
  urgency: text("urgency").notNull().default("normal"),
  notes: text("notes"),
  status: text("status").notNull().default("new"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  createdBy: integer("created_by").references(() => usersTable.id),
  approvedByAccountingUserId: integer("approved_by_accounting_user_id").references(() => usersTable.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  invoiceTriggeredAt: timestamp("invoice_triggered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  quantity: integer("quantity").notNull(),
  unitPriceSnapshot: numeric("unit_price_snapshot", { precision: 10, scale: 2 }).notNull(),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
