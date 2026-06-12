/**
 * seed-demo-analytics.ts
 *
 * Idempotent demo data seed for V2.5 analytics/reporting demo.
 * Safe to run multiple times — checks for existing demo records before inserting.
 *
 * Runs DDL first (Step 0) so the script is self-contained — no need to run
 * create-tables-v2-5 separately before this script.
 *
 * What it creates/updates (NEVER deletes existing data):
 *  0. Ensures all V2.5 hardening columns exist (idempotent DDL)
 *  1. Ensures products have a costPrice (60-70% of unit price)
 *  2. Backfills invoiceDate/dueDate on existing approved orders that lack them
 *  3. Creates demo approved orders with realistic payment scenarios:
 *       - ≥3 paid orders (paid on time)
 *       - ≥3 unpaid orders (non-overdue)
 *       - ≥3 overdue unpaid orders
 *       - ≥2 paid-late orders (paid after due date)
 *  4. Creates ≥6 free_sample orders (order_source = "free_sample")
 *  5. Backfills leads: importance from consumption, region from address or "Other"
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run seed-demo-analytics
 */

import { pool, db, ordersTable, orderItemsTable, productsTable, customersTable, customerAddressesTable, deliveriesTable, accountingApprovalsTable, usersTable, leadsTable } from "@workspace/db";
import { eq, isNull, inArray, sql } from "drizzle-orm";

// ── Step 0: Ensure all V2.5 hardening columns exist ───────────────────────────
async function ensureColumns(client: any) {
  console.log("[seed-demo-analytics] Step 0: Ensuring V2.5 hardening columns exist...");

  // products
  await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2)`);

  // order_items
  await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cost_price_snapshot NUMERIC(10,2)`);
  await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_percent_snapshot NUMERIC(5,2)`);

  // orders
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_date TEXT`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS due_date TEXT`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS collected_amount NUMERIC(12,2)`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS sample_reason TEXT`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS sample_event_name TEXT`);

  // leads
  await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)`);
  await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS region TEXT`);
  await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS importance TEXT NOT NULL DEFAULT 'normal'`);

  // deliveries — issue lifecycle
  await client.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS issue_reported_at TIMESTAMPTZ`);
  await client.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS issue_resolved_at TIMESTAMPTZ`);
  await client.query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS resolution_note TEXT`);

  console.log("  → All V2.5 hardening columns verified/added\n");
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[seed-demo-analytics] Starting...\n");

  // ── 0. Ensure all V2.5 columns exist (DDL, idempotent) ────────────────────
  const pgClient = await pool.connect();
  try {
    await ensureColumns(pgClient);
  } finally {
    pgClient.release();
  }

  // ── 1. Ensure products have costPrice ─────────────────────────────────────
  console.log("[seed-demo-analytics] Step 1: Ensuring products have costPrice...");
  const products = await db.select().from(productsTable).where(eq(productsTable.active, true));
  let costUpdated = 0;
  for (const p of products) {
    if (p.costPrice == null) {
      const unitPrice = parseFloat(p.unitPrice as unknown as string);
      // Coffee cost is typically 60-70% of sale price
      const costPct = 0.60 + Math.random() * 0.10;
      const costPrice = Math.round(unitPrice * costPct * 100) / 100;
      await db.update(productsTable)
        .set({ costPrice: String(costPrice) } as any)
        .where(eq(productsTable.id, p.id));
      costUpdated++;
    }
  }
  console.log(`  → Updated ${costUpdated} products with costPrice (${products.length - costUpdated} already set)\n`);

  // Reload products with costs
  const allProducts = await db.select().from(productsTable).where(eq(productsTable.active, true));
  const productById = Object.fromEntries(allProducts.map(p => [p.id, p]));

  // ── 2. Backfill costPriceSnapshot on existing order_items ─────────────────
  console.log("[seed-demo-analytics] Step 2: Backfilling costPriceSnapshot on order_items...");
  const itemsNoCost = await db.select().from(orderItemsTable).where(isNull(orderItemsTable.costPriceSnapshot));
  let itemsUpdated = 0;
  for (const item of itemsNoCost) {
    const prod = productById[item.productId];
    if (prod?.costPrice != null) {
      await db.update(orderItemsTable)
        .set({ costPriceSnapshot: prod.costPrice } as any)
        .where(eq(orderItemsTable.id, item.id));
      itemsUpdated++;
    }
  }
  console.log(`  → Backfilled ${itemsUpdated} order_items with costPriceSnapshot\n`);

  // ── 3. Backfill invoiceDate/dueDate on existing approved orders ───────────
  console.log("[seed-demo-analytics] Step 3: Backfilling invoiceDate/dueDate on approved orders...");
  const approvedOrdersNoDates = await db.select().from(ordersTable)
    .where(sql`status = 'approved' AND (invoice_date IS NULL OR due_date IS NULL)`);

  // Get customers for payment terms
  const customerIds = [...new Set(approvedOrdersNoDates.map(o => o.customerId))];
  const customers = customerIds.length > 0
    ? await db.select().from(customersTable).where(inArray(customersTable.id, customerIds))
    : [];
  const customerMap = Object.fromEntries(customers.map(c => [c.id, c]));

  // Get deliveries for arrivalMarkedAt
  const orderIdsForDeliveries = approvedOrdersNoDates.map(o => o.id);
  const deliveries = orderIdsForDeliveries.length > 0
    ? await db.select().from(deliveriesTable).where(inArray(deliveriesTable.orderId, orderIdsForDeliveries))
    : [];
  const deliveryByOrder = Object.fromEntries(
    deliveries.map(d => [d.orderId, d])
  );

  let backfilled = 0;
  for (const order of approvedOrdersNoDates) {
    const cust = customerMap[order.customerId];
    const delivery = deliveryByOrder[order.id];

    // Determine invoice date: arrivalMarkedAt → scheduledDate → approvedAt → 30 days ago
    let invoiceDate: string;
    if (delivery?.arrivalMarkedAt) {
      invoiceDate = delivery.arrivalMarkedAt.toISOString().split("T")[0];
    } else if (delivery?.scheduledDate) {
      invoiceDate = delivery.scheduledDate;
    } else if (order.approvedAt) {
      invoiceDate = order.approvedAt.toISOString().split("T")[0];
    } else {
      invoiceDate = daysAgo(30);
    }

    // Payment terms
    const terms = cust?.paymentTerms ?? "net_30";
    let ptDays = 30;
    if (terms === "net_14") ptDays = 14;
    else if (terms === "net_30") ptDays = 30;
    else if (terms === "net_60") ptDays = 60;
    else if (terms === "cash_on_delivery") ptDays = 0;

    const dueDate = addDays(invoiceDate, ptDays);

    await db.update(ordersTable).set({
      invoiceDate,
      dueDate,
      paymentTermsDays: ptDays,
    } as any).where(eq(ordersTable.id, order.id));
    backfilled++;
  }
  console.log(`  → Backfilled ${backfilled} approved orders with invoiceDate/dueDate\n`);

  // ── 4. Ensure we have enough demo customers and products ──────────────────
  console.log("[seed-demo-analytics] Step 4: Loading existing customers and products for demo orders...");
  const allCustomers = await db.select().from(customersTable).where(eq(customersTable.active, true));
  if (allCustomers.length === 0) {
    console.error("  ✗ No active customers found — cannot create demo orders. Run the main seed first.");
    return;
  }
  if (allProducts.length === 0) {
    console.error("  ✗ No active products found — cannot create demo orders. Run the main seed first.");
    return;
  }

  // Find or create an accounting user to approve demo orders
  const [accountingUser] = await db.select().from(usersTable)
    .where(sql`role IN ('accounting', 'owner_admin', 'general_manager') AND active = true`)
    .limit(1) as any[];
  if (!accountingUser) {
    console.error("  ✗ No accounting/admin user found. Run the main seed first.");
    return;
  }

  console.log(`  → ${allCustomers.length} customers, ${allProducts.length} products, approver: ${accountingUser.fullName}\n`);

  // Pick a diverse set of customers
  function pickCustomers(n: number) {
    const shuffled = [...allCustomers].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, shuffled.length));
  }

  function pickProducts(n: number) {
    const shuffled = [...allProducts].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, shuffled.length));
  }

  // ── 5. Check how many demo orders we already have ─────────────────────────
  const existingDemoOrders = await db.select().from(ordersTable)
    .where(sql`notes LIKE '%[DEMO-ANALYTICS]%'`);

  const existingPaid     = existingDemoOrders.filter(o => o.paymentStatus === "paid" && !o.notes?.includes("late"));
  const existingUnpaid   = existingDemoOrders.filter(o => o.paymentStatus !== "paid" && o.dueDate && o.dueDate >= today());
  const existingOverdue  = existingDemoOrders.filter(o => o.paymentStatus !== "paid" && o.dueDate && o.dueDate < today());
  const existingLatePaid = existingDemoOrders.filter(o => o.paymentStatus === "paid" && o.notes?.includes("[DEMO-ANALYTICS-LATE]"));
  const existingSamples  = existingDemoOrders.filter(o => o.orderSource === "free_sample" || o.orderSource === "sample");

  const needPaid     = Math.max(0, 3 - existingPaid.length);
  const needUnpaid   = Math.max(0, 3 - existingUnpaid.length);
  const needOverdue  = Math.max(0, 3 - existingOverdue.length);
  const needLatePaid = Math.max(0, 2 - existingLatePaid.length);
  const needSamples  = Math.max(0, 6 - existingSamples.length);

  console.log(`[seed-demo-analytics] Step 5: Demo order gaps:`);
  console.log(`  Paid (on-time):  need ${needPaid}`);
  console.log(`  Unpaid:          need ${needUnpaid}`);
  console.log(`  Overdue:         need ${needOverdue}`);
  console.log(`  Paid-late:       need ${needLatePaid}`);
  console.log(`  Samples:         need ${needSamples}\n`);

  // ── Helper: create a full demo order with delivery + accounting approval ──
  async function createDemoOrder(opts: {
    customer: typeof allCustomers[0];
    products: typeof allProducts;
    orderSource: string;
    invoiceDateOffset: number;  // days ago
    ptDays: number;
    paymentStatus: "paid" | "unpaid";
    paidDaysAfterDue?: number; // positive = late, negative = early, 0 = on due date
    sampleReason?: string;
    noteTag: string;
  }) {
    const { customer, products: prods, orderSource, invoiceDateOffset, ptDays, paymentStatus, paidDaysAfterDue, sampleReason, noteTag } = opts;

    const invoiceDate = daysAgo(invoiceDateOffset);
    const dueDate = addDays(invoiceDate, ptDays);
    const scheduledDate = subtractDays(invoiceDate, 1);

    // Build order items
    const items = prods.slice(0, 1 + Math.floor(Math.random() * 2)).map(p => {
      const qty = 1 + Math.floor(Math.random() * 10);
      const unitPrice = parseFloat(p.unitPrice as unknown as string);
      const costPrice = p.costPrice ? parseFloat(p.costPrice as unknown as string) : unitPrice * 0.65;
      const lineTotal = qty * unitPrice;
      return { productId: p.id, quantity: qty, unitPrice, costPrice, lineTotal };
    });
    const totalAmount = items.reduce((s, i) => s + i.lineTotal, 0);

    const orderNumber = await nextOrderNumber();
    const deliveryNumber = await nextDeliveryNumber();

    // Create order
    const [order] = await db.insert(ordersTable).values({
      orderNumber,
      customerId: customer.id,
      businessChannel: customer.businessChannel ?? customer.customerChannel ?? "horeca",
      orderSource,
      requestedDeliveryDate: scheduledDate,
      urgency: "normal",
      notes: `${noteTag} Auto-generated for V2.5 analytics demo.`,
      status: "approved",
      totalAmount: String(totalAmount),
      createdBy: accountingUser.id,
      approvedByAccountingUserId: accountingUser.id,
      approvedAt: new Date(invoiceDate + "T10:00:00Z"),
      invoiceTriggeredAt: new Date(invoiceDate + "T10:00:00Z"),
      invoiceDate,
      dueDate,
      paymentTermsDays: ptDays,
      paymentStatus,
      sampleReason: sampleReason ?? null,
      paidAt: paymentStatus === "paid"
        ? new Date(addDays(dueDate, paidDaysAfterDue ?? -5) + "T14:00:00Z")
        : null,
      collectedAmount: paymentStatus === "paid" ? String(totalAmount) : null,
    } as any).returning();

    // Create order items
    for (const item of items) {
      await db.insert(orderItemsTable).values({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceSnapshot: String(item.unitPrice),
        costPriceSnapshot: String(item.costPrice),
        lineTotal: String(item.lineTotal),
      } as any);
    }

    // Create delivery
    const [delivery] = await db.insert(deliveriesTable).values({
      deliveryNumber,
      orderId: order.id,
      customerId: customer.id,
      status: "approved",
      urgency: "normal",
      businessChannel: order.businessChannel,
      scheduledDate,
      hasDocument: true,
      arrivalMarkedAt: new Date(scheduledDate + "T09:00:00Z"),
      documentationUploadedAt: new Date(scheduledDate + "T09:30:00Z"),
      invoiceTriggered: true,
      invoiceTriggeredAt: new Date(invoiceDate + "T10:00:00Z"),
    } as any).returning();

    // Create accounting approval
    await db.insert(accountingApprovalsTable).values({
      deliveryId: delivery.id,
      orderId: order.id,
      status: "approved",
      reviewedBy: accountingUser.id,
      reviewedAt: new Date(invoiceDate + "T10:00:00Z"),
      reviewNotes: "Demo analytics record",
    } as any).onConflictDoNothing();

    return order;
  }

  // ── 6. Create paid (on-time) orders ──────────────────────────────────────
  if (needPaid > 0) {
    console.log(`[seed-demo-analytics] Creating ${needPaid} paid (on-time) orders...`);
    const customers = pickCustomers(needPaid);
    for (let i = 0; i < needPaid; i++) {
      const cust = customers[i % customers.length];
      const ptDays = [14, 30, 30][i % 3];
      await createDemoOrder({
        customer: cust,
        products: pickProducts(2),
        orderSource: "phone",
        invoiceDateOffset: ptDays + 10 + i * 5,
        ptDays,
        paymentStatus: "paid",
        paidDaysAfterDue: -3 - i,
        noteTag: "[DEMO-ANALYTICS]",
      });
    }
    console.log("  → Done\n");
  }

  // ── 7. Create unpaid (not overdue) orders ─────────────────────────────────
  if (needUnpaid > 0) {
    console.log(`[seed-demo-analytics] Creating ${needUnpaid} unpaid (non-overdue) orders...`);
    const customers = pickCustomers(needUnpaid);
    for (let i = 0; i < needUnpaid; i++) {
      const cust = customers[i % customers.length];
      const ptDays = [14, 30, 60][i % 3];
      await createDemoOrder({
        customer: cust,
        products: pickProducts(2),
        orderSource: "b2b",
        invoiceDateOffset: 5 + i * 3,          // recent invoice
        ptDays,
        paymentStatus: "unpaid",
        noteTag: "[DEMO-ANALYTICS]",
      });
    }
    console.log("  → Done\n");
  }

  // ── 8. Create overdue unpaid orders ──────────────────────────────────────
  if (needOverdue > 0) {
    console.log(`[seed-demo-analytics] Creating ${needOverdue} overdue unpaid orders...`);
    const customers = pickCustomers(needOverdue);
    for (let i = 0; i < needOverdue; i++) {
      const cust = customers[i % customers.length];
      const ptDays = [14, 30, 30][i % 3];
      await createDemoOrder({
        customer: cust,
        products: pickProducts(2),
        orderSource: "sales_rep",
        invoiceDateOffset: ptDays + 15 + i * 7,  // old invoice → overdue
        ptDays,
        paymentStatus: "unpaid",
        noteTag: "[DEMO-ANALYTICS]",
      });
    }
    console.log("  → Done\n");
  }

  // ── 9. Create paid-late orders ─────────────────────────────────────────
  if (needLatePaid > 0) {
    console.log(`[seed-demo-analytics] Creating ${needLatePaid} paid-late orders...`);
    const customers = pickCustomers(needLatePaid);
    for (let i = 0; i < needLatePaid; i++) {
      const cust = customers[i % customers.length];
      const ptDays = 30;
      await createDemoOrder({
        customer: cust,
        products: pickProducts(2),
        orderSource: "phone",
        invoiceDateOffset: ptDays + 20 + i * 10,
        ptDays,
        paymentStatus: "paid",
        paidDaysAfterDue: 10 + i * 5,  // paid late
        noteTag: "[DEMO-ANALYTICS-LATE]",
      });
    }
    console.log("  → Done\n");
  }

  // ── 10. Create free sample orders ─────────────────────────────────────
  if (needSamples > 0) {
    console.log(`[seed-demo-analytics] Creating ${needSamples} free sample orders...`);
    const sampleReasons = ["tasting", "customer_visit", "promotional", "machine_setup", "fair", "fair", "other"];
    const customers = pickCustomers(needSamples);
    for (let i = 0; i < needSamples; i++) {
      const cust = customers[i % customers.length];
      await createDemoOrder({
        customer: cust,
        products: pickProducts(1),
        orderSource: "free_sample",
        invoiceDateOffset: 10 + i * 8,
        ptDays: 0,
        paymentStatus: "paid",    // free samples are zero-cost or comped
        paidDaysAfterDue: 0,
        sampleReason: sampleReasons[i % sampleReasons.length],
        noteTag: "[DEMO-ANALYTICS]",
      });
    }
    console.log("  → Done\n");
  }

  // ── 11. Backfill leads: importance + region ───────────────────────────────
  console.log("[seed-demo-analytics] Step 11: Backfilling leads importance and region...");
  const leads = await db.select().from(leadsTable);

  // Get customer addresses for region inference
  const allAddresses = await db.select().from(customerAddressesTable);
  const addressByCustomer = Object.fromEntries(allAddresses.map(a => [a.customerId, a]));

  let leadsUpdated = 0;
  for (const lead of leads) {
    const updates: Record<string, any> = {};

    // Only backfill if importance is still "normal" (default) and we have consumption data
    if ((lead.importance === "normal" || lead.importance == null) && lead.estimatedMonthlyConsumption) {
      const kg = parseInt(lead.estimatedMonthlyConsumption, 10);
      if (!isNaN(kg)) {
        if (kg >= 100) updates.importance = "high_potential";
        else if (kg >= 50) updates.importance = "important";
      }
    }

    // Only backfill region if not set
    if (!lead.region) {
      // Try to find customer with same company name and get their address city
      const matchingAddress = allAddresses.find(a => a.city && a.city.length > 0);
      if (matchingAddress?.city) {
        // Map city to region (simplified)
        const city = matchingAddress.city.toLowerCase();
        if (city.includes("oslo")) updates.region = "Oslo";
        else if (city.includes("bergen")) updates.region = "Vestland";
        else if (city.includes("stavanger") || city.includes("sandnes")) updates.region = "Rogaland";
        else if (city.includes("trondheim")) updates.region = "Trøndelag";
        else if (city.includes("tromsø")) updates.region = "Troms og Finnmark";
        else updates.region = "Other";
      } else {
        updates.region = "Other";
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.update(leadsTable).set(updates).where(eq(leadsTable.id, lead.id));
      leadsUpdated++;
    }
  }
  console.log(`  → Updated ${leadsUpdated} leads\n`);

  console.log("[seed-demo-analytics] ✅ Complete!\n");
  console.log("Summary:");
  console.log("  • Products costPrice ensured");
  console.log("  • order_items costPriceSnapshot backfilled");
  console.log("  • Approved orders invoiceDate/dueDate backfilled");
  console.log(`  • Created ${needPaid} paid (on-time) + ${needUnpaid} unpaid + ${needOverdue} overdue + ${needLatePaid} paid-late + ${needSamples} sample orders`);
  console.log("  • Leads importance/region backfilled");
}

main().catch(async (err) => {
  console.error("[seed-demo-analytics] Fatal error:", err);
  await pool.end();
  process.exit(1);
}).finally(async () => {
  await pool.end();
});
