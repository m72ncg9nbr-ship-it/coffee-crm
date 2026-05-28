/**
 * Idempotent demo seeder. Safe to run on a populated DB — it bails out as
 * soon as it sees that the demo admin user already exists. Drop the DB or
 * truncate the relevant tables to reseed from scratch.
 *
 * Usage: pnpm --filter @workspace/scripts run seed
 */
import { scryptSync, randomBytes } from "node:crypto";
import {
  db,
  pool,
  usersTable,
  customersTable,
  customerAddressesTable,
  productsTable,
  leadsTable,
  inventoryPoolsTable,
  productInventoryTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const DEMO_USERS = [
  { username: "admin",   password: "admin123", fullName: "Alex Thompson",  email: "admin@coffeedist.com",  role: "owner_admin",     channelScope: "all",    phone: null },
  { username: "gm1",     password: "gm123",    fullName: "Maria Jensen",   email: "gm1@coffeedist.com",    role: "general_manager", channelScope: "all",    phone: null },
  { username: "ops1",    password: "ops123",   fullName: "Sven Eriksen",   email: "ops1@coffeedist.com",   role: "channel_manager", channelScope: "coffee", phone: null },
  { username: "sales1",  password: "sales123", fullName: "Sofia Andersen", email: "sales1@coffeedist.com", role: "sales",           channelScope: "coffee", phone: "+47 90 11 22 33" },
  { username: "driver1", password: "driver123",fullName: "Carlos Rivera",  email: "driver1@coffeedist.com",role: "driver",          channelScope: "all",    phone: "+47 90 44 55 66" },
  { username: "acct1",   password: "acct123",  fullName: "Lina Hauge",     email: "acct1@coffeedist.com",  role: "accounting",      channelScope: "all",    phone: null },
];

const DEMO_PRODUCTS = [
  { productName: "House Blend Espresso 1kg", sku: "ESP-HOUSE-1K", category: "coffee", unitPrice: "32", stockStatus: "in_stock", businessChannel: "horeca" },
  { productName: "Single Origin Ethiopia 500g", sku: "SO-ETH-500", category: "coffee", unitPrice: "24", stockStatus: "in_stock", businessChannel: "horeca" },
  { productName: "Decaf Brazil 1kg", sku: "DEC-BRA-1K", category: "coffee", unitPrice: "28", stockStatus: "in_stock", businessChannel: "horeca" },
  { productName: "Cleaning Tablets 16-pack", sku: "CLEAN-TAB-016", category: "accessories", unitPrice: "12", stockStatus: "in_stock", businessChannel: "horeca" },
  { productName: "Descaler Solution 500ml", sku: "DESC-SOL-500", category: "accessories", unitPrice: "8.5", stockStatus: "in_stock", businessChannel: "horeca" },
  { productName: "Paper Filters 100-pack", sku: "FILT-PAP-100", category: "accessories", unitPrice: "4.5", stockStatus: "in_stock", businessChannel: "horeca" },
  { productName: "Office Drip Blend 1kg", sku: "OFF-DRIP-1K", category: "coffee", unitPrice: "18", stockStatus: "in_stock", businessChannel: "office" },
  { productName: "Retail Whole Bean Bag 250g", sku: "RTL-WB-250", category: "coffee", unitPrice: "12", stockStatus: "in_stock", businessChannel: "retail" },
];

type SeedCustomer = {
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  customerChannel: string;
  segment: string;
  priorityClass: "A" | "B" | "C";
  paymentTerms: string;
  discountLevel: string | null;
  notes: string | null;
  businessChannel: string;
  address: { street: string; postalCode: string; city: string; country: string; district?: string };
};

const DEMO_CUSTOMERS: SeedCustomer[] = [
  { companyName: "Grand Hotel Centrale", contactPerson: "Marco Rossi", phone: "+39 06 555 0101", email: "marco@grandcentrale.it", customerChannel: "horeca", segment: "hotel", priorityClass: "A", paymentTerms: "net_14", discountLevel: "12", notes: "Top-tier hotel chain. Weekly delivery.", businessChannel: "horeca", address: { street: "Via Veneto 45", postalCode: "00187", city: "Rome", country: "IT" } },
  { companyName: "Brewed & Baked", contactPerson: "Thomas Meyer", phone: "+49 89 2345678", email: "thomas@brewedbaked.de", customerChannel: "horeca", segment: "cafe", priorityClass: "A", paymentTerms: "net_21", discountLevel: "10", notes: "Specialty coffee and bakery, very loyal customer", businessChannel: "horeca", address: { street: "Maximilianstr 12", postalCode: "80539", city: "Munich", country: "DE" } },
  { companyName: "Caffe Milano Chain", contactPerson: "Giulia Rossi", phone: "+39 02 9876543", email: "giulia@caffemilano.it", customerChannel: "retail", segment: "cafe_chain", priorityClass: "A", paymentTerms: "net_30", discountLevel: "15", notes: "12-store chain across northern Italy", businessChannel: "retail", address: { street: "Corso Buenos Aires 8", postalCode: "20124", city: "Milan", country: "IT" } },
  { companyName: "Le Petit Bistro", contactPerson: "Amelie Dupont", phone: "+33 1 4567 8901", email: "amelie@petitbistro.fr", customerChannel: "horeca", segment: "restaurant", priorityClass: "B", paymentTerms: "net_30", discountLevel: "5", notes: null, businessChannel: "horeca", address: { street: "Rue de Rivoli 200", postalCode: "75001", city: "Paris", country: "FR" } },
  { companyName: "Nordic Roasters AS", contactPerson: "Erik Lund", phone: "+47 22 12 34 56", email: "erik@nordicroasters.no", customerChannel: "retail", segment: "cafe_chain", priorityClass: "B", paymentTerms: "net_30", discountLevel: "8", notes: "Norwegian coffee chain, growing fast", businessChannel: "retail", address: { street: "Karl Johans gate 14", postalCode: "0154", city: "Oslo", country: "NO" } },
  { companyName: "Bar Aperitivo", contactPerson: "Luca Bianchi", phone: "+39 02 5556789", email: "luca@aperitivo.it", customerChannel: "horeca", segment: "bar", priorityClass: "B", paymentTerms: "net_14", discountLevel: null, notes: null, businessChannel: "horeca", address: { street: "Navigli 33", postalCode: "20144", city: "Milan", country: "IT" } },
  { companyName: "Tech Hub Coworking", contactPerson: "Maja Berg", phone: "+47 23 45 67 89", email: "maja@techhub.no", customerChannel: "office", segment: "coworking", priorityClass: "B", paymentTerms: "net_30", discountLevel: null, notes: null, businessChannel: "office", address: { street: "Nydalen 10", postalCode: "0484", city: "Oslo", country: "NO" } },
  { companyName: "Bakery Söderberg", contactPerson: "Olof Söderberg", phone: "+46 8 765 4321", email: "olof@soderberg.se", customerChannel: "horeca", segment: "bakery", priorityClass: "C", paymentTerms: "net_30", discountLevel: null, notes: null, businessChannel: "horeca", address: { street: "Götgatan 22", postalCode: "11848", city: "Stockholm", country: "SE" } },
  { companyName: "Catering Plus", contactPerson: "Hannah Schmidt", phone: "+49 30 1112 3344", email: "hannah@cateringplus.de", customerChannel: "horeca", segment: "catering", priorityClass: "C", paymentTerms: "net_45", discountLevel: null, notes: null, businessChannel: "horeca", address: { street: "Friedrichstrasse 100", postalCode: "10117", city: "Berlin", country: "DE" } },
  { companyName: "Kiosk Sentralen", contactPerson: "Per Hansen", phone: "+47 21 30 40 50", email: "per@kiosksentralen.no", customerChannel: "retail", segment: "kiosk", priorityClass: "C", paymentTerms: "cash_on_delivery", discountLevel: null, notes: "Cash on delivery only", businessChannel: "retail", address: { street: "Storgata 5", postalCode: "0155", city: "Oslo", country: "NO" } },
];

const DEMO_LEADS = [
  { companyName: "Aperitivo Bar Roma", contactPerson: "Giuseppe Conti", phone: "+39 06 1234567", email: "giuseppe@aperitivoroma.it", businessChannel: "horeca", businessType: "bar", estimatedMonthlyConsumption: "80", preferredCoffeeType: "espresso_blend", requestedMachineType: "super_automatic", requestedPaymentTerms: "net_30", extraNotes: "Looking to upgrade from current supplier" },
  { companyName: "Office Hub Bergen", contactPerson: "Astrid Berg", phone: "+47 55 12 34 56", email: "astrid@officehub.no", businessChannel: "office", businessType: "coworking", estimatedMonthlyConsumption: "30", preferredCoffeeType: "filter", requestedMachineType: "bean_to_cup", requestedPaymentTerms: "net_30", extraNotes: "200-seat coworking opening Q3" },
  { companyName: "Café Pequeño", contactPerson: "Maria Garcia", phone: "+34 91 234 5678", email: "maria@pequeno.es", businessChannel: "horeca", businessType: "cafe", estimatedMonthlyConsumption: "20", preferredCoffeeType: "espresso_blend", requestedMachineType: "manual", requestedPaymentTerms: "net_14", extraNotes: "Small neighbourhood cafe" },
];

async function tableHasRows(table: any): Promise<boolean> {
  const [{ count }] = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text AS count FROM ${table}`,
  ).then((r: any) => r.rows ?? r);
  return Number(count) > 0;
}

async function seedInventoryPools() {
  const existingPools = await db.select().from(inventoryPoolsTable);
  if (existingPools.length === 0) {
    console.log("Seeding inventory pools…");
    await db.insert(inventoryPoolsTable).values([
      { name: "physical_sales", label: "Physical Sales" },
      { name: "online_sales",   label: "Online Sales" },
      { name: "free_samples",   label: "Free Samples" },
    ]);
  } else {
    console.log("Inventory pools already present — leaving them alone.");
  }
}

async function seedProductInventory() {
  const poolRows   = await db.select().from(inventoryPoolsTable);
  const productRows = await db.select().from(productsTable);
  const existingInv = await db.select().from(productInventoryTable);

  if (existingInv.length === 0 && poolRows.length > 0 && productRows.length > 0) {
    console.log("Seeding initial product inventory (100 units per pool)…");
    const invValues: { productId: number; poolId: number; quantityAvailable: number; quantityReserved: number }[] = [];
    for (const prod of productRows) {
      for (const poolRow of poolRows) {
        invValues.push({ productId: prod.id, poolId: poolRow.id, quantityAvailable: 100, quantityReserved: 0 });
      }
    }
    await db.insert(productInventoryTable).values(invValues);
  } else {
    console.log("Product inventory already present — leaving it alone.");
  }
}

async function main() {
  // ── V1.5 inventory tables are always seeded first, independently of demo data ──
  // This ensures they populate even when the demo admin already exists from a prior run.
  await seedInventoryPools();

  const existingAdmin = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, "admin"));

  if (existingAdmin.length > 0) {
    console.log("Demo admin user already exists — skipping demo data. Checking product inventory…");
    await seedProductInventory();
    console.log("Seed complete.");
    await pool.end();
    return;
  }

  console.log("Seeding users…");
  for (const u of DEMO_USERS) {
    await db.insert(usersTable).values({
      username: u.username,
      passwordHash: hashPassword(u.password),
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      role: u.role,
      channelScope: u.channelScope,
    });
  }

  if (!(await tableHasRows(productsTable))) {
    console.log("Seeding products…");
    await db.insert(productsTable).values(DEMO_PRODUCTS);
  } else {
    console.log("Products already present — leaving them alone.");
  }

  console.log("Seeding customers + addresses…");
  const adminRow = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, "sales1"));
  const createdByUserId = adminRow[0]?.id ?? null;

  for (const c of DEMO_CUSTOMERS) {
    const [customer] = await db
      .insert(customersTable)
      .values({
        companyName: c.companyName,
        contactPerson: c.contactPerson,
        phone: c.phone,
        email: c.email,
        customerChannel: c.customerChannel,
        segment: c.segment,
        priorityClass: c.priorityClass,
        paymentTerms: c.paymentTerms,
        discountLevel: c.discountLevel,
        notes: c.notes,
        businessChannel: c.businessChannel,
        createdByUserId,
      })
      .returning({ id: customersTable.id });

    await db.insert(customerAddressesTable).values({
      customerId: customer.id,
      addressType: "delivery",
      label: "Main",
      street: c.address.street,
      district: c.address.district ?? null,
      city: c.address.city,
      postalCode: c.address.postalCode,
      country: c.address.country,
      isDeliveryAddress: true,
      isBillingAddress: true,
      isDefault: true,
    });
  }

  console.log("Seeding leads…");
  for (const l of DEMO_LEADS) {
    const consumption = parseInt(l.estimatedMonthlyConsumption, 10);
    const auto = consumption >= 50;
    await db.insert(leadsTable).values({
      ...l,
      status: auto ? "qualified" : "manual_review",
      qualificationResult: auto ? "auto_qualified" : "needs_review",
      qualificationReason: auto
        ? `Monthly consumption ${consumption}kg meets qualification threshold (>= 50kg).`
        : `Monthly consumption ${consumption}kg below auto-qualify threshold; requires sales review.`,
      followUpDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }

  await seedProductInventory();

  console.log("Seed complete.");
  await pool.end();
}

main().catch(async err => {
  console.error("Seed failed:", err);
  await pool.end();
  process.exit(1);
});
