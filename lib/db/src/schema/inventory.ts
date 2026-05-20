import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { ordersTable } from "./orders";
import { usersTable } from "./users";

export const inventoryPoolsTable = pgTable("inventory_pools", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // physical_sales | online_sales | free_samples
  label: text("label").notNull(),
});

export const productInventoryTable = pgTable("product_inventory", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  poolId: integer("pool_id").notNull().references(() => inventoryPoolsTable.id),
  quantityAvailable: integer("quantity_available").notNull().default(0),
  quantityReserved: integer("quantity_reserved").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  productPoolUniq: uniqueIndex("product_inventory_product_pool_uniq").on(t.productId, t.poolId),
}));

export const inventoryAllocationsTable = pgTable("inventory_allocations", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  poolId: integer("pool_id").notNull().references(() => inventoryPoolsTable.id),
  quantity: integer("quantity").notNull(),
  // reserved = stock deducted; insufficient = no stock available, nothing deducted
  // released = stock returned to pool; manual_review = needs human action (post-approval cancel)
  status: text("status").notNull().default("reserved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const inventoryMovementsTable = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  poolId: integer("pool_id").notNull().references(() => inventoryPoolsTable.id),
  quantityDelta: integer("quantity_delta").notNull(), // negative = outbound, positive = inbound
  reason: text("reason").notNull(),
  referenceType: text("reference_type"), // "order" | "manual"
  referenceId: integer("reference_id"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InventoryPool = typeof inventoryPoolsTable.$inferSelect;
export type ProductInventory = typeof productInventoryTable.$inferSelect;
export type InventoryAllocation = typeof inventoryAllocationsTable.$inferSelect;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
