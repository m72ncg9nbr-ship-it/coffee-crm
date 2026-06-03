/**
 * create-tables-v2-5.ts
 *
 * Idempotent DDL for V2.5 Analytics / Profitability / Collection data foundation.
 * Uses ADD COLUMN IF NOT EXISTS — safe to run multiple times.
 *
 * Changes:
 *   products          — cost_price (nullable)
 *   order_items       — cost_price_snapshot, discount_percent_snapshot (both nullable)
 *   orders            — invoice_date, due_date, payment_terms_days, payment_status,
 *                       paid_at, collected_amount, sample_reason, sample_event_name
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run create-tables-v2-5
 */

import { pool } from "@workspace/db";

async function main() {
  const client = await pool.connect();
  try {
    console.log("[create-tables-v2-5] Running DDL...\n");

    // ── products ──────────────────────────────────────────────────────────────
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2)`);
    console.log("[create-tables-v2-5] products.cost_price — OK");

    // ── order_items ──────────────────────────────────────────────────────────
    await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cost_price_snapshot NUMERIC(10,2)`);
    console.log("[create-tables-v2-5] order_items.cost_price_snapshot — OK");

    await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_percent_snapshot NUMERIC(5,2)`);
    console.log("[create-tables-v2-5] order_items.discount_percent_snapshot — OK");

    // ── orders ────────────────────────────────────────────────────────────────
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_date TEXT`);
    console.log("[create-tables-v2-5] orders.invoice_date — OK");

    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS due_date TEXT`);
    console.log("[create-tables-v2-5] orders.due_date — OK");

    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER`);
    console.log("[create-tables-v2-5] orders.payment_terms_days — OK");

    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'`);
    console.log("[create-tables-v2-5] orders.payment_status — OK");

    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);
    console.log("[create-tables-v2-5] orders.paid_at — OK");

    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS collected_amount NUMERIC(12,2)`);
    console.log("[create-tables-v2-5] orders.collected_amount — OK");

    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS sample_reason TEXT`);
    console.log("[create-tables-v2-5] orders.sample_reason — OK");

    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS sample_event_name TEXT`);
    console.log("[create-tables-v2-5] orders.sample_event_name — OK");

    console.log("\n[create-tables-v2-5] All V2.5 columns are in place.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (err) => {
  console.error("[create-tables-v2-5] Fatal error:", err);
  await pool.end();
  process.exit(1);
});
