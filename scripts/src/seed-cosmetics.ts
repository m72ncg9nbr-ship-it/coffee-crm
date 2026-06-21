/**
 * seed-cosmetics.ts
 *
 * Idempotent Stage 3 seed for NS Global Operations Hub — Cosmetics channel.
 * Safe to run multiple times — checks for existing records before inserting.
 * Never deletes or truncates existing data.
 *
 * What it creates (idempotent — skips if already present):
 *   0.  DDL: ADD COLUMN IF NOT EXISTS brand TEXT on products
 *   1.  44 cosmetics products (22 HQ Clinique + 22 Hubislab), businessChannel='cosmetics'
 *   2.  6 cosmetics customers, businessChannel='cosmetics'
 *   3.  Customer delivery addresses (1 per customer)
 *   4.  3 cosmetics leads, businessChannel='cosmetics'
 *   5.  Inventory entries for cosmetics products (physical_sales pool)
 *   6.  15 cosmetics orders across full workflow stages:
 *         5 approved + paid (complete lifecycle)
 *         4 approved + unpaid (not overdue)
 *         3 approved + overdue unpaid
 *         2 awaiting_accounting_approval (pending)
 *         1 planned order
 *       Each approved order has a delivery + accounting_approval record
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run seed-cosmetics
 */

import {
  pool,
  db,
  ordersTable,
  orderItemsTable,
  productsTable,
  customersTable,
  customerAddressesTable,
  deliveriesTable,
  accountingApprovalsTable,
  usersTable,
  leadsTable,
  inventoryPoolsTable,
  productInventoryTable,
} from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";

// ── Tag used for idempotency checks ────────────────────────────────────────────
const SEED_TAG = "[COSM-SEED]";

// ── Date helpers ──────────────────────────────────────────────────────────────
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}
function subtractDays(dateStr: string, days: number): string {
  return addDays(dateStr, -days);
}
function today(): string {
  return new Date().toISOString().split("T")[0];
}
function daysAgo(n: number): string {
  return subtractDays(today(), n);
}
function daysFromNow(n: number): string {
  return addDays(today(), n);
}

async function nextOrderNumber(): Promise<string> {
  const rows = await db.execute<{ next: number }>(sql`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(order_number, '[^0-9]', '', 'g'), '')::int), 0) + 1 AS next
    FROM orders
  `);
  const n = Number((rows as any).rows?.[0]?.next ?? (rows as any)[0]?.next ?? 1);
  return `ORD-${String(n).padStart(4, "0")}`;
}

async function nextDeliveryNumber(): Promise<string> {
  const rows = await db.execute<{ next: number }>(sql`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(delivery_number, '[^0-9]', '', 'g'), '')::int), 0) + 1 AS next
    FROM deliveries
  `);
  const n = Number((rows as any).rows?.[0]?.next ?? (rows as any)[0]?.next ?? 1);
  return `DEL-${String(n).padStart(4, "0")}`;
}

// ── Step 0: Idempotent DDL ────────────────────────────────────────────────────
async function ensureColumns(client: any) {
  console.log("[seed-cosmetics] Step 0: DDL — ensuring brand column on products...");
  await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT`);
  console.log("  → products.brand column ensured\n");
}

// ── Product catalog ───────────────────────────────────────────────────────────

const HQ_CLINIQUE_PRODUCTS = [
  // Skin Care Cream (6)
  { sku: "HQC-SC-001", productName: "Acne Control Care Cream",           category: "Skin Care Cream",        unitPrice: "320", costPrice: "160", brand: "HQ Clinique" },
  { sku: "HQC-SC-002", productName: "Anti-Blemish Cream",                category: "Skin Care Cream",        unitPrice: "300", costPrice: "150", brand: "HQ Clinique" },
  { sku: "HQC-SC-003", productName: "Intense Moisturizing Care Cream",   category: "Skin Care Cream",        unitPrice: "380", costPrice: "190", brand: "HQ Clinique" },
  { sku: "HQC-SC-004", productName: "Skin Lift Cream",                   category: "Skin Care Cream",        unitPrice: "420", costPrice: "210", brand: "HQ Clinique" },
  { sku: "HQC-SC-005", productName: "Anti-Aging Care Cream",             category: "Skin Care Cream",        unitPrice: "440", costPrice: "220", brand: "HQ Clinique" },
  { sku: "HQC-SC-006", productName: "Eye Control Care Cream",            category: "Skin Care Cream",        unitPrice: "360", costPrice: "180", brand: "HQ Clinique" },
  // Skin Care Serum (8)
  { sku: "HQC-SS-001", productName: "Anti-Acne Serum",                   category: "Skin Care Serum",        unitPrice: "380", costPrice: "190", brand: "HQ Clinique" },
  { sku: "HQC-SS-002", productName: "Anti-Spot Serum",                   category: "Skin Care Serum",        unitPrice: "400", costPrice: "200", brand: "HQ Clinique" },
  { sku: "HQC-SS-003", productName: "Collagen Serum",                    category: "Skin Care Serum",        unitPrice: "480", costPrice: "240", brand: "HQ Clinique" },
  { sku: "HQC-SS-004", productName: "Glow Skin Serum",                   category: "Skin Care Serum",        unitPrice: "420", costPrice: "210", brand: "HQ Clinique" },
  { sku: "HQC-SS-005", productName: "AHA/BHA Serum",                     category: "Skin Care Serum",        unitPrice: "460", costPrice: "230", brand: "HQ Clinique" },
  { sku: "HQC-SS-006", productName: "Niacinamide Serum",                 category: "Skin Care Serum",        unitPrice: "350", costPrice: "175", brand: "HQ Clinique" },
  { sku: "HQC-SS-007", productName: "Retinol Serum",                     category: "Skin Care Serum",        unitPrice: "520", costPrice: "260", brand: "HQ Clinique" },
  { sku: "HQC-SS-008", productName: "Anti-Aging Serum",                  category: "Skin Care Serum",        unitPrice: "500", costPrice: "250", brand: "HQ Clinique" },
  // Skin Care Tonic (2)
  { sku: "HQC-ST-001", productName: "Acne Control Face Tonic",           category: "Skin Care Tonic",        unitPrice: "240", costPrice: "120", brand: "HQ Clinique" },
  { sku: "HQC-ST-002", productName: "Anti Blemish Face Tonic",           category: "Skin Care Tonic",        unitPrice: "260", costPrice: "130", brand: "HQ Clinique" },
  // Skin Care Cleansing Gel (2)
  { sku: "HQC-SG-001", productName: "Acne Control Face Cleansing Gel",   category: "Skin Care Cleansing Gel", unitPrice: "220", costPrice: "110", brand: "HQ Clinique" },
  { sku: "HQC-SG-002", productName: "Anti Blemish Face Cleansing Gel",   category: "Skin Care Cleansing Gel", unitPrice: "220", costPrice: "110", brand: "HQ Clinique" },
  // Hair Care (2)
  { sku: "HQC-HC-001", productName: "Hair Care Tonic",                   category: "Hair Care",              unitPrice: "300", costPrice: "150", brand: "HQ Clinique" },
  { sku: "HQC-HC-002", productName: "Hair Care Serum",                   category: "Hair Care",              unitPrice: "340", costPrice: "170", brand: "HQ Clinique" },
  // Foot Care (2)
  { sku: "HQC-FC-001", productName: "Advanced Foot & Nail Spray",        category: "Foot Care",              unitPrice: "200", costPrice: "100", brand: "HQ Clinique" },
  { sku: "HQC-FC-002", productName: "Foot Care Cream",                   category: "Foot Care",              unitPrice: "180", costPrice: "90",  brand: "HQ Clinique" },
];

const HUBISLAB_PRODUCTS = [
  // Pure Balance Line (3)
  { sku: "HUB-PB-001", productName: "Pure Balance Papaya Enzyme Peeling Wash",    category: "Pure Balance Line",  unitPrice: "220", costPrice: "110", brand: "Hubislab" },
  { sku: "HUB-PB-002", productName: "Pure Balance Refreshing Cleansing Milk",     category: "Pure Balance Line",  unitPrice: "200", costPrice: "100", brand: "Hubislab" },
  { sku: "HUB-PB-003", productName: "Pure Balance Refreshing Cleansing Gel",      category: "Pure Balance Line",  unitPrice: "200", costPrice: "100", brand: "Hubislab" },
  // Post Rays (4)
  { sku: "HUB-PR-001", productName: "Post Rays Derma Regener K Solution",         category: "Post Rays",          unitPrice: "280", costPrice: "140", brand: "Hubislab" },
  { sku: "HUB-PR-002", productName: "Post Rays Derma Regener Moisturizer",        category: "Post Rays",          unitPrice: "320", costPrice: "160", brand: "Hubislab" },
  { sku: "HUB-PR-003", productName: "Post Rays Derma Regener K Cream",            category: "Post Rays",          unitPrice: "340", costPrice: "170", brand: "Hubislab" },
  { sku: "HUB-PR-004", productName: "Post Rays Derma Regener Cell Cream",         category: "Post Rays",          unitPrice: "380", costPrice: "190", brand: "Hubislab" },
  // Moisture Max (3)
  { sku: "HUB-MM-001", productName: "Moisture Max Cleansing Foam",                category: "Moisture Max",       unitPrice: "200", costPrice: "100", brand: "Hubislab" },
  { sku: "HUB-MM-002", productName: "Moisture Max Hydro Moisturizer",             category: "Moisture Max",       unitPrice: "260", costPrice: "130", brand: "Hubislab" },
  { sku: "HUB-MM-003", productName: "Moisture Max Hydro Cream",                   category: "Moisture Max",       unitPrice: "280", costPrice: "140", brand: "Hubislab" },
  // A.C Clearing (1)
  { sku: "HUB-AC-001", productName: "A.C Clearing Active Control Cream",          category: "A.C Clearing",       unitPrice: "260", costPrice: "130", brand: "Hubislab" },
  // Premium Active (3)
  { sku: "HUB-PA-001", productName: "Premium Active Revival Essence",             category: "Premium Active",     unitPrice: "320", costPrice: "160", brand: "Hubislab" },
  { sku: "HUB-PA-002", productName: "Premium Active B-Tx I Ampoule",             category: "Premium Active",     unitPrice: "460", costPrice: "230", brand: "Hubislab" },
  { sku: "HUB-PA-003", productName: "Premium Active Eternal Eye & Face Cream",   category: "Premium Active",     unitPrice: "480", costPrice: "240", brand: "Hubislab" },
  // Ampoule (4)
  { sku: "HUB-AM-001", productName: "Post Rays Chamomile Complex 70 Ampoule",    category: "Ampoule",            unitPrice: "360", costPrice: "180", brand: "Hubislab" },
  { sku: "HUB-AM-002", productName: "A.C Clearing Tea Tree Complex 50 Ampoule",  category: "Ampoule",            unitPrice: "340", costPrice: "170", brand: "Hubislab" },
  { sku: "HUB-AM-003", productName: "Moisture Max Hyaluron Complex 165 Ampoule", category: "Ampoule",            unitPrice: "400", costPrice: "200", brand: "Hubislab" },
  { sku: "HUB-AM-004", productName: "Derma Max Vitamin-C Complex 550 Ampoule",   category: "Ampoule",            unitPrice: "520", costPrice: "260", brand: "Hubislab" },
  // Protect (2)
  { sku: "HUB-PT-001", productName: "Herb B Soothing Blemish Balm",              category: "Protect",            unitPrice: "240", costPrice: "120", brand: "Hubislab" },
  { sku: "HUB-PT-002", productName: "Post Rays Derma Perfect Sunscreen",         category: "Protect",            unitPrice: "280", costPrice: "140", brand: "Hubislab" },
  // e+ Epiderma Mask (2)
  { sku: "HUB-EM-001", productName: "e+ Epiderma Nova Cell Soothing Mask",       category: "e+ Epiderma Mask",   unitPrice: "180", costPrice: "90",  brand: "Hubislab" },
  { sku: "HUB-EM-002", productName: "e+ Epiderma Nova Cell Brightening Mask",    category: "e+ Epiderma Mask",   unitPrice: "180", costPrice: "90",  brand: "Hubislab" },
];

// ── Customer catalog ───────────────────────────────────────────────────────────

const COSMETICS_CUSTOMERS = [
  {
    companyName: "Beauty Hub Oslo AS",
    contactPerson: "Ingrid Halvorsen",
    phone: "+47 22 10 30 40",
    email: "ingrid@beautyhub.no",
    customerChannel: "cosmetics",
    segment: "retail",
    priorityClass: "A",
    paymentTerms: "net_30",
    discountLevel: "5.00",
    notes: "Large multi-brand retailer, flagship Oslo store + 2 outlets. Fast payer.",
    address: { street: "Bogstadveien 12", city: "Oslo", postalCode: "0355", country: "Norway" },
  },
  {
    companyName: "Kozmos Beauty Store Bergen",
    contactPerson: "Maja Nygård",
    phone: "+47 55 60 70 80",
    email: "maja@kozmos.no",
    customerChannel: "cosmetics",
    segment: "retail",
    priorityClass: "B",
    paymentTerms: "net_30",
    discountLevel: "3.00",
    notes: "Premium cosmetics boutique in Bergen city centre. Monthly re-orders.",
    address: { street: "Strandgaten 6", city: "Bergen", postalCode: "5013", country: "Norway" },
  },
  {
    companyName: "Glam Studio Trondheim AS",
    contactPerson: "Silje Bakke",
    phone: "+47 73 50 20 10",
    email: "silje@glamstudio.no",
    customerChannel: "cosmetics",
    segment: "salon",
    priorityClass: "B",
    paymentTerms: "net_14",
    discountLevel: "7.00",
    notes: "Professional makeup & styling studio. Uses Hubislab for client sessions.",
    address: { street: "Thomas Angells gate 8", city: "Trondheim", postalCode: "7012", country: "Norway" },
  },
  {
    companyName: "Nordic Beauty Academy",
    contactPerson: "Anne Kristoffersen",
    phone: "+47 22 85 40 50",
    email: "anne@nordicacademy.no",
    customerChannel: "cosmetics",
    segment: "education",
    priorityClass: "A",
    paymentTerms: "net_30",
    discountLevel: "10.00",
    notes: "Leading makeup artistry school. Buys in bulk for student kits each semester.",
    address: { street: "Majorstuen 14", city: "Oslo", postalCode: "0367", country: "Norway" },
  },
  {
    companyName: "Luxe Spa & Wellness AS",
    contactPerson: "Emilie Strand",
    phone: "+47 67 10 25 35",
    email: "emilie@luxespa.no",
    customerChannel: "cosmetics",
    segment: "spa",
    priorityClass: "C",
    paymentTerms: "net_60",
    discountLevel: "2.00",
    notes: "Luxury day spa and wellness centre. Primarily HQ Clinique skincare treatments.",
    address: { street: "Sandvika Storsenter 2", city: "Sandvika", postalCode: "1337", country: "Norway" },
  },
  {
    companyName: "StylePoint Retail AS",
    contactPerson: "Kristian Moen",
    phone: "+47 69 40 15 60",
    email: "kristian@stylepoint.no",
    customerChannel: "cosmetics",
    segment: "retail",
    priorityClass: "C",
    paymentTerms: "net_30",
    discountLevel: null,
    notes: "Multi-brand beauty retailer in Østfold region. Seasonal ordering pattern.",
    address: { street: "City Syd 3", city: "Fredrikstad", postalCode: "1632", country: "Norway" },
  },
];

// ── Leads catalog ─────────────────────────────────────────────────────────────

const COSMETICS_LEADS = [
  {
    companyName: "Elite Beauty Oslo",
    contactPerson: "Nora Lindgren",
    phone: "+47 22 95 12 34",
    email: "nora@elitebeauty.no",
    businessType: "retail",
    estimatedMonthlyConsumption: "120",
    preferredCoffeeType: null,
    requestedPaymentTerms: "net_30",
    extraNotes: "High-end multi-brand store in Aker Brygge. Interested in exclusive HQ Clinique distribution.",
    status: "new",
    region: "Oslo",
    importance: "high_potential",
  },
  {
    companyName: "Malin Beauty Concept",
    contactPerson: "Malin Ohr",
    phone: "+47 90 23 45 67",
    email: "malin@malinbeauty.no",
    businessType: "salon",
    estimatedMonthlyConsumption: "60",
    preferredCoffeeType: null,
    requestedPaymentTerms: "net_14",
    extraNotes: "Boutique bridal & event makeup studio. Uses pro cosmetics. Interested in Hubislab wholesale.",
    status: "contacted",
    region: "Vestland",
    importance: "important",
  },
  {
    companyName: "Skönhetssalong Malmö",
    contactPerson: "Sara Bergström",
    phone: "+46 40 22 34 56",
    email: "sara@skonhetssalong.se",
    businessType: "salon",
    estimatedMonthlyConsumption: "40",
    preferredCoffeeType: null,
    requestedPaymentTerms: "net_30",
    extraNotes: "Swedish client — cross-border opportunity. Premium salon in Malmö. Initial contact via trade show.",
    status: "new",
    region: "Other",
    importance: "normal",
  },
];

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[seed-cosmetics] Starting V3 cosmetics seed...\n");

  // ── 0. DDL ────────────────────────────────────────────────────────────────
  const pgClient = await pool.connect();
  try {
    await ensureColumns(pgClient);
  } finally {
    pgClient.release();
  }

  // ── Resolve approver user ─────────────────────────────────────────────────
  const [approverUser] = await db.select().from(usersTable)
    .where(sql`role IN ('accounting', 'owner_admin', 'general_manager') AND active = true`)
    .limit(1) as any[];
  if (!approverUser) {
    console.error("[seed-cosmetics] ✗ No accounting/admin user found. Run main seed first.");
    return;
  }
  console.log(`[seed-cosmetics] Using approver: ${approverUser.fullName} (${approverUser.role})\n`);

  // ── Resolve inventory pool ────────────────────────────────────────────────
  const allPools = await db.select().from(inventoryPoolsTable);
  const physicalPool = allPools.find(p => p.name === "physical_sales");
  if (!physicalPool) {
    console.error("[seed-cosmetics] ✗ physical_sales inventory pool not found. Run backfill-inventory first.");
    return;
  }
  console.log(`[seed-cosmetics] Using pool: ${physicalPool.label} (id=${physicalPool.id})\n`);

  // ── 1. Products ───────────────────────────────────────────────────────────
  console.log("[seed-cosmetics] Step 1: Seeding cosmetics products...");
  const allProductDefs = [...HQ_CLINIQUE_PRODUCTS, ...HUBISLAB_PRODUCTS];
  const insertedProductIds: number[] = [];
  let prodInserted = 0;
  let prodSkipped = 0;

  for (const p of allProductDefs) {
    const existing = await db.select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, p.sku))
      .limit(1);

    if (existing.length > 0) {
      insertedProductIds.push(existing[0].id);
      prodSkipped++;
      continue;
    }

    const [inserted] = await db.insert(productsTable).values({
      productName: p.productName,
      sku: p.sku,
      category: p.category,
      unitPrice: p.unitPrice,
      costPrice: p.costPrice,
      businessChannel: "cosmetics",
      stockStatus: "in_stock",
      active: true,
    } as any).returning({ id: productsTable.id });

    // Set brand via raw SQL since schema doesn't have the column yet as a typed field
    await db.execute(sql`UPDATE products SET brand = ${p.brand} WHERE id = ${inserted.id}`);

    insertedProductIds.push(inserted.id);
    prodInserted++;
  }
  console.log(`  → ${prodInserted} inserted, ${prodSkipped} already existed (${insertedProductIds.length} total)\n`);

  // ── 2. Customers ──────────────────────────────────────────────────────────
  console.log("[seed-cosmetics] Step 2: Seeding cosmetics customers...");
  const insertedCustomerIds: number[] = [];
  let custInserted = 0;
  let custSkipped = 0;

  for (const c of COSMETICS_CUSTOMERS) {
    const existing = await db.select({ id: customersTable.id })
      .from(customersTable)
      .where(sql`company_name = ${c.companyName} AND business_channel = 'cosmetics'`)
      .limit(1);

    if (existing.length > 0) {
      insertedCustomerIds.push(existing[0].id);
      custSkipped++;
      continue;
    }

    const [inserted] = await db.insert(customersTable).values({
      companyName: c.companyName,
      contactPerson: c.contactPerson,
      phone: c.phone,
      email: c.email,
      customerChannel: c.customerChannel,
      segment: c.segment,
      priorityClass: c.priorityClass,
      paymentTerms: c.paymentTerms,
      discountLevel: c.discountLevel ?? null,
      notes: c.notes,
      businessChannel: "cosmetics",
      active: true,
    } as any).returning({ id: customersTable.id });

    insertedCustomerIds.push(inserted.id);

    // Insert delivery address
    await db.insert(customerAddressesTable).values({
      customerId: inserted.id,
      addressType: "delivery",
      label: "Main",
      street: c.address.street,
      city: c.address.city,
      postalCode: c.address.postalCode,
      country: c.address.country,
      isDeliveryAddress: true,
      isBillingAddress: true,
      isDefault: true,
    } as any);

    custInserted++;
  }
  console.log(`  → ${custInserted} inserted, ${custSkipped} already existed (${insertedCustomerIds.length} total)\n`);

  // ── 3. Leads ──────────────────────────────────────────────────────────────
  console.log("[seed-cosmetics] Step 3: Seeding cosmetics leads...");
  let leadsInserted = 0;
  let leadsSkipped = 0;

  for (const l of COSMETICS_LEADS) {
    const existing = await db.select({ id: leadsTable.id })
      .from(leadsTable)
      .where(sql`company_name = ${l.companyName} AND business_channel = 'cosmetics'`)
      .limit(1);

    if (existing.length > 0) {
      leadsSkipped++;
      continue;
    }

    await db.insert(leadsTable).values({
      companyName: l.companyName,
      contactPerson: l.contactPerson,
      phone: l.phone,
      email: l.email,
      businessChannel: "cosmetics",
      businessType: l.businessType,
      estimatedMonthlyConsumption: l.estimatedMonthlyConsumption,
      preferredCoffeeType: null,
      requestedPaymentTerms: l.requestedPaymentTerms,
      extraNotes: l.extraNotes,
      status: l.status,
      region: l.region,
      importance: l.importance,
      followUpDueAt: l.status === "contacted" ? new Date(daysFromNow(3) + "T09:00:00Z") : null,
    } as any);

    leadsInserted++;
  }
  console.log(`  → ${leadsInserted} inserted, ${leadsSkipped} already existed\n`);

  // ── 4. Inventory entries ──────────────────────────────────────────────────
  console.log("[seed-cosmetics] Step 4: Seeding inventory for cosmetics products...");
  let invInserted = 0;
  let invSkipped = 0;

  // Quantities by product category
  const categoryStock: Record<string, number> = {
    "Moisturizer": 80,
    "Serum": 60,
    "Cleanser": 100,
    "Toner": 70,
    "Eye Care": 50,
    "Sunscreen": 60,
    "Treatment": 45,
    "Body Care": 55,
    "Foundation": 90,
    "Color Cosmetics": 75,
    "Eye Makeup": 85,
    "Lip Color": 95,
    "Setting": 70,
    "Makeup Tools": 40,
  };

  const allCosmeticProds = await db.select()
    .from(productsTable)
    .where(eq(productsTable.businessChannel, "cosmetics"));

  for (const prod of allCosmeticProds) {
    const existing = await db.select({ id: productInventoryTable.id })
      .from(productInventoryTable)
      .where(sql`product_id = ${prod.id} AND pool_id = ${physicalPool.id}`)
      .limit(1);

    if (existing.length > 0) {
      invSkipped++;
      continue;
    }

    const qty = categoryStock[prod.category] ?? 50;
    await db.insert(productInventoryTable).values({
      productId: prod.id,
      poolId: physicalPool.id,
      quantityAvailable: qty,
      quantityReserved: 0,
    } as any);
    invInserted++;
  }
  console.log(`  → ${invInserted} inserted, ${invSkipped} already existed\n`);

  // ── 5. Orders ─────────────────────────────────────────────────────────────
  console.log("[seed-cosmetics] Step 5: Seeding cosmetics orders...");

  // Count existing cosmetics seed orders
  const existingCosmeticOrders = await db.select({ id: ordersTable.id })
    .from(ordersTable)
    .where(sql`notes LIKE ${"%" + SEED_TAG + "%"}`);

  if (existingCosmeticOrders.length > 0) {
    console.log(`  → ${existingCosmeticOrders.length} cosmetics seed orders already exist — skipping order creation.\n`);
  } else {
    if (insertedCustomerIds.length === 0) {
      console.log("  → No cosmetics customers found — skipping orders.\n");
    } else {
      // Re-fetch cosmetics customers to ensure we have them
      const cosmeticCustomers = await db.select()
        .from(customersTable)
        .where(eq(customersTable.businessChannel, "cosmetics"));

      // Re-fetch cosmetics products
      const cosmeticProducts = await db.select()
        .from(productsTable)
        .where(eq(productsTable.businessChannel, "cosmetics"));

      await createCosmeticOrders(cosmeticCustomers, cosmeticProducts, approverUser);
    }
  }

  console.log("\n[seed-cosmetics] ✅ Complete!\n");
  console.log("Summary:");
  console.log(`  • 44 cosmetics products (22 HQ Clinique + 22 Hubislab)`);
  console.log(`  • 6 cosmetics customers with delivery addresses`);
  console.log(`  • 3 cosmetics leads`);
  console.log(`  • Inventory seeded for physical_sales pool`);
  console.log(`  • 15 cosmetics orders across all workflow stages`);
  console.log(`  • Products branded with brand column`);
}

// ── Order creation helper ─────────────────────────────────────────────────────

async function createCosmeticOrders(
  customers: any[],
  products: any[],
  approverUser: any,
) {
  let ordersCreated = 0;

  // Pick products for an order (1-3 items)
  function pickItems(count = 2) {
    const shuffled = [...products].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  type OrderSpec = {
    customerIdx: number;
    status: string;
    invoiceDaysAgo?: number;
    ptDays?: number;
    paymentStatus?: string;
    paidDaysAfterInvoice?: number;
    itemCount?: number;
    label: string;
  };

  const orderSpecs: OrderSpec[] = [
    // 5 approved + paid orders (complete lifecycle)
    { customerIdx: 0, status: "approved", invoiceDaysAgo: 45, ptDays: 30, paymentStatus: "paid",   paidDaysAfterInvoice: 25, label: "paid-1" },
    { customerIdx: 1, status: "approved", invoiceDaysAgo: 38, ptDays: 30, paymentStatus: "paid",   paidDaysAfterInvoice: 20, label: "paid-2" },
    { customerIdx: 3, status: "approved", invoiceDaysAgo: 22, ptDays: 14, paymentStatus: "paid",   paidDaysAfterInvoice: 12, label: "paid-3" },
    { customerIdx: 2, status: "approved", invoiceDaysAgo: 60, ptDays: 30, paymentStatus: "paid",   paidDaysAfterInvoice: 28, label: "paid-4" },
    { customerIdx: 5, status: "approved", invoiceDaysAgo: 75, ptDays: 60, paymentStatus: "paid",   paidDaysAfterInvoice: 55, label: "paid-5" },

    // 4 approved + unpaid (not overdue)
    { customerIdx: 0, status: "approved", invoiceDaysAgo: 10, ptDays: 30, paymentStatus: "unpaid",  label: "unpaid-1" },
    { customerIdx: 3, status: "approved", invoiceDaysAgo: 8,  ptDays: 30, paymentStatus: "unpaid",  label: "unpaid-2" },
    { customerIdx: 1, status: "approved", invoiceDaysAgo: 5,  ptDays: 14, paymentStatus: "unpaid",  label: "unpaid-3" },
    { customerIdx: 4, status: "approved", invoiceDaysAgo: 15, ptDays: 60, paymentStatus: "unpaid",  label: "unpaid-4" },

    // 3 approved + overdue unpaid
    { customerIdx: 5, status: "approved", invoiceDaysAgo: 50, ptDays: 30, paymentStatus: "unpaid",  label: "overdue-1" },
    { customerIdx: 4, status: "approved", invoiceDaysAgo: 65, ptDays: 30, paymentStatus: "unpaid",  label: "overdue-2" },
    { customerIdx: 2, status: "approved", invoiceDaysAgo: 80, ptDays: 60, paymentStatus: "unpaid",  label: "overdue-3" },

    // 2 awaiting accounting approval
    { customerIdx: 1, status: "awaiting_accounting_approval", label: "pending-1" },
    { customerIdx: 3, status: "awaiting_accounting_approval", label: "pending-2" },

    // 1 planned order
    { customerIdx: 0, status: "planned", label: "planned-1" },
  ];

  for (const spec of orderSpecs) {
    const customer = customers[spec.customerIdx % customers.length];
    const items = pickItems(spec.itemCount ?? 2);
    const noteTag = `${SEED_TAG} [${spec.label}]`;

    const orderNumber = await nextOrderNumber();
    const isApproved = spec.status === "approved";
    const isAwaiting = spec.status === "awaiting_accounting_approval";

    let invoiceDate: string | null = null;
    let dueDate: string | null = null;
    let ptDays: number | null = null;
    let paymentStatus = "unpaid";
    let paidAt: Date | null = null;
    let collectedAmount: string | null = null;
    let approvedAt: Date | null = null;
    let invoiceTriggeredAt: Date | null = null;

    const scheduledDate = daysAgo((spec.invoiceDaysAgo ?? 7) + 1);
    const requestedDeliveryDate = scheduledDate;

    if (isApproved && spec.invoiceDaysAgo != null && spec.ptDays != null) {
      invoiceDate = daysAgo(spec.invoiceDaysAgo);
      ptDays = spec.ptDays;
      dueDate = addDays(invoiceDate, ptDays);
      paymentStatus = spec.paymentStatus ?? "unpaid";
      approvedAt = new Date(invoiceDate + "T10:00:00Z");
      invoiceTriggeredAt = new Date(invoiceDate + "T10:00:00Z");

      if (paymentStatus === "paid" && spec.paidDaysAfterInvoice != null) {
        const paidDate = addDays(invoiceDate, spec.paidDaysAfterInvoice);
        paidAt = new Date(paidDate + "T14:00:00Z");
      }
    }

    // Build items
    const orderItems = items.map(p => {
      const qty = 2 + Math.floor(Math.random() * 8);
      const unitPrice = parseFloat(p.unitPrice);
      const costPrice = p.costPrice ? parseFloat(p.costPrice) : unitPrice * 0.45;
      return { productId: p.id, quantity: qty, unitPrice, costPrice, lineTotal: qty * unitPrice };
    });
    const totalAmount = orderItems.reduce((s, i) => s + i.lineTotal, 0);
    if (paymentStatus === "paid") {
      collectedAmount = String(totalAmount);
    }

    const [order] = await db.insert(ordersTable).values({
      orderNumber,
      customerId: customer.id,
      businessChannel: "cosmetics",
      orderSource: "b2b",
      requestedDeliveryDate,
      urgency: "normal",
      notes: noteTag,
      status: spec.status,
      totalAmount: String(totalAmount),
      createdBy: approverUser.id,
      approvedByAccountingUserId: isApproved ? approverUser.id : null,
      approvedAt,
      invoiceTriggeredAt,
      invoiceDate,
      dueDate,
      paymentTermsDays: ptDays,
      paymentStatus,
      paidAt,
      collectedAmount,
    } as any).returning();

    for (const item of orderItems) {
      await db.insert(orderItemsTable).values({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceSnapshot: String(item.unitPrice),
        costPriceSnapshot: String(item.costPrice),
        lineTotal: String(item.lineTotal),
      } as any);
    }

    if (isApproved || isAwaiting) {
      const deliveryNumber = await nextDeliveryNumber();
      const [delivery] = await db.insert(deliveriesTable).values({
        deliveryNumber,
        orderId: order.id,
        customerId: customer.id,
        status: isApproved ? "approved" : "out_for_delivery",
        urgency: "normal",
        businessChannel: "cosmetics",
        scheduledDate,
        hasDocument: isApproved,
        arrivalMarkedAt: isApproved ? new Date(scheduledDate + "T09:00:00Z") : null,
        documentationUploadedAt: isApproved ? new Date(scheduledDate + "T09:30:00Z") : null,
        invoiceTriggered: isApproved,
        invoiceTriggeredAt: isApproved && invoiceDate ? new Date(invoiceDate + "T10:00:00Z") : null,
      } as any).returning();

      if (isApproved) {
        await db.insert(accountingApprovalsTable).values({
          deliveryId: delivery.id,
          orderId: order.id,
          status: "approved",
          reviewedBy: approverUser.id,
          reviewedAt: approvedAt,
          reviewNotes: "Cosmetics demo record",
        } as any).onConflictDoNothing();
      } else {
        // awaiting_accounting_approval → pending approval record
        await db.insert(accountingApprovalsTable).values({
          deliveryId: delivery.id,
          orderId: order.id,
          status: "pending",
        } as any).onConflictDoNothing();
      }
    }

    ordersCreated++;
    console.log(`  → ${orderNumber} [${spec.label}] ${spec.status} ${paymentStatus || ""}`);
  }

  console.log(`  → ${ordersCreated} orders created total`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

main().catch(async (err) => {
  console.error("[seed-cosmetics] Fatal error:", err);
  await pool.end();
  process.exit(1);
}).finally(async () => {
  await pool.end();
});
