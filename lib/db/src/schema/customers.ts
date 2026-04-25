import { pgTable, text, serial, boolean, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  contactPerson: text("contact_person").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  customerChannel: text("customer_channel").notNull(),
  segment: text("segment").notNull(),
  priorityClass: text("priority_class").notNull().default("C"),
  paymentTerms: text("payment_terms").notNull(),
  discountLevel: numeric("discount_level", { precision: 5, scale: 2 }),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  businessChannel: text("business_channel").notNull(),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const customerAddressesTable = pgTable("customer_addresses", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  addressType: text("address_type").notNull().default("delivery"),
  label: text("label"),
  street: text("street").notNull(),
  district: text("district"),
  city: text("city").notNull(),
  postalCode: text("postal_code").notNull(),
  country: text("country").notNull(),
  isDeliveryAddress: boolean("is_delivery_address").notNull().default(true),
  isBillingAddress: boolean("is_billing_address").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCustomerAddressSchema = createInsertSchema(customerAddressesTable).omit({ id: true, createdAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
export type CustomerAddress = typeof customerAddressesTable.$inferSelect;
