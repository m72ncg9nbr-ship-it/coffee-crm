/**
 * create-tables-payment-rules.ts
 *
 * Idempotent DDL for customer-level payment/order blocking rules.
 * Uses ADD COLUMN IF NOT EXISTS — safe to run multiple times.
 *
 * Changes:
 *   customers — payment_order_rule_mode, overdue_threshold_amount,
 *               grace_period_days, allow_admin_gm_override, payment_order_rule_note
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run create-tables-payment-rules
 */

import { pool } from "@workspace/db";

async function main() {
  const client = await pool.connect();
  try {
    console.log("[create-tables-payment-rules] Running DDL...\n");

    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_order_rule_mode TEXT NOT NULL DEFAULT 'no_block'`);
    console.log("[create-tables-payment-rules] customers.payment_order_rule_mode — OK");

    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS overdue_threshold_amount NUMERIC(12,2)`);
    console.log("[create-tables-payment-rules] customers.overdue_threshold_amount — OK");

    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS grace_period_days INTEGER NOT NULL DEFAULT 0`);
    console.log("[create-tables-payment-rules] customers.grace_period_days — OK");

    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS allow_admin_gm_override BOOLEAN NOT NULL DEFAULT false`);
    console.log("[create-tables-payment-rules] customers.allow_admin_gm_override — OK");

    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_order_rule_note TEXT`);
    console.log("[create-tables-payment-rules] customers.payment_order_rule_note — OK");

    console.log("\n[create-tables-payment-rules] All payment rule columns are in place.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (err) => {
  console.error("[create-tables-payment-rules] Fatal error:", err);
  await pool.end();
  process.exit(1);
});
