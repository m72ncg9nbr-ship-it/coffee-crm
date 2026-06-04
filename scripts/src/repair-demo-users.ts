/**
 * repair-demo-users.ts
 *
 * Idempotent upsert for all demo users.
 *
 * What it does:
 *   - Upserts every demo user by username (INSERT … ON CONFLICT DO UPDATE).
 *   - Resets passwordHash to the canonical demo password for that user.
 *   - Ensures role, channelScope, and active=true are correct.
 *   - NEVER deletes or modifies orders, customers, products, or inventory.
 *   - Safe to run multiple times — each run is a no-op if already correct.
 *
 * Demo credentials after running this script:
 *   admin    / admin123   — owner_admin     / all
 *   gm1      / gm123      — general_manager / all
 *   ops1     / ops123     — channel_manager / coffee
 *   ops2     / ops2123    — channel_manager / coffee
 *   sales1   / sales123   — sales           / coffee
 *   sales2   / sales2123  — sales           / coffee
 *   sales3   / sales3123  — sales           / coffee
 *   driver1  / driver123  — driver          / all
 *   driver2  / driver2123 — driver          / all
 *   acct1    / acct123    — accounting      / all
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run repair-demo-users
 */

import { scryptSync, randomBytes } from "node:crypto";
import { db, pool, usersTable } from "@workspace/db";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const DEMO_USERS = [
  { username: "admin",   password: "admin123",   fullName: "Alex Thompson",  email: "admin@coffeedist.com",   role: "owner_admin",     channelScope: "all",    phone: null as string | null },
  { username: "gm1",     password: "gm123",      fullName: "Maria Jensen",   email: "gm1@coffeedist.com",     role: "general_manager", channelScope: "all",    phone: null as string | null },
  { username: "ops1",    password: "ops123",     fullName: "Sven Eriksen",   email: "ops1@coffeedist.com",    role: "channel_manager", channelScope: "coffee", phone: null as string | null },
  { username: "ops2",    password: "ops2123",    fullName: "Ingrid Olsen",   email: "ops2@coffeedist.com",    role: "channel_manager", channelScope: "coffee", phone: null as string | null },
  { username: "sales1",  password: "sales123",   fullName: "Sofia Andersen", email: "sales1@coffeedist.com",  role: "sales",           channelScope: "coffee", phone: "+47 90 11 22 33" as string | null },
  { username: "sales2",  password: "sales2123",  fullName: "Jonas Berg",     email: "sales2@coffeedist.com",  role: "sales",           channelScope: "coffee", phone: null as string | null },
  { username: "sales3",  password: "sales3123",  fullName: "Nora Vik",       email: "sales3@coffeedist.com",  role: "sales",           channelScope: "coffee", phone: null as string | null },
  { username: "driver1", password: "driver123",  fullName: "Carlos Rivera",  email: "driver1@coffeedist.com", role: "driver",          channelScope: "all",    phone: "+47 90 44 55 66" as string | null },
  { username: "driver2", password: "driver2123", fullName: "Lars Nilsen",    email: "driver2@coffeedist.com", role: "driver",          channelScope: "all",    phone: null as string | null },
  { username: "acct1",   password: "acct123",    fullName: "Lina Hauge",     email: "acct1@coffeedist.com",   role: "accounting",      channelScope: "all",    phone: null as string | null },
];

async function main() {
  console.log("[repair-demo-users] Upserting demo users...\n");

  for (const u of DEMO_USERS) {
    const passwordHash = hashPassword(u.password);

    await db
      .insert(usersTable)
      .values({
        username:     u.username,
        passwordHash,
        fullName:     u.fullName,
        email:        u.email,
        phone:        u.phone,
        role:         u.role,
        channelScope: u.channelScope,
        active:       true,
      })
      .onConflictDoUpdate({
        target: usersTable.username,
        set: {
          passwordHash,
          role:         u.role,
          channelScope: u.channelScope,
          active:       true,
        },
      });

    console.log(
      `  ✓ ${u.username.padEnd(10)} role=${u.role.padEnd(18)} channelScope=${u.channelScope.padEnd(8)} password reset`,
    );
  }

  console.log("\n[repair-demo-users] Done. All demo users have known credentials.\n");
  console.log("  Credentials:");
  for (const u of DEMO_USERS) {
    console.log(`    ${u.username.padEnd(10)} / ${u.password}`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error("[repair-demo-users] Fatal error:", err);
  await pool.end();
  process.exit(1);
});
