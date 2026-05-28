/**
 * migrate-roles-v2.ts
 *
 * Idempotent migration from V1 roles to V2.5 roles.
 *
 * Role renames:
 *   admin / ops / operations  →  owner_admin / channel_manager
 *
 * channelScope enforcement rules:
 *   owner_admin, general_manager, accounting, driver  →  keep "all" (intentional)
 *   channel_manager, sales                            →  must have a real channel
 *
 * Named demo-user fixes (explicit, takes priority):
 *   ops1, ops2             →  channelScope = coffee
 *   sales1, sales2, sales3 →  channelScope = coffee
 *
 * Catch-all rule (runs after named fixes):
 *   Any remaining channel_manager or sales user still on channelScope="all"
 *   is defaulted to "coffee" (the current active channel).
 *   This catches unnamed extra users and future regressions.
 *
 * gm1 (general_manager) is inserted if not already present.
 *
 * Safe to run multiple times — every step is idempotent.
 * Never deletes data, never resets the database.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run migrate-roles-v2
 */

import { scryptSync, randomBytes } from "node:crypto";
import { db, pool, usersTable } from "@workspace/db";
import { eq, or, and } from "drizzle-orm";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  console.log("[migrate-roles-v2] Starting V2.5 role migration...\n");

  // ── Step 1: Role renames ────────────────────────────────────────────────────

  const adminResult = await db
    .update(usersTable)
    .set({ role: "owner_admin" })
    .where(eq(usersTable.role, "admin"))
    .returning({ id: usersTable.id, username: usersTable.username });

  if (adminResult.length > 0) {
    console.log(`[step 1] ${adminResult.length} user(s): admin → owner_admin`);
    adminResult.forEach(u => console.log(`         ${u.username} (id=${u.id})`));
  } else {
    console.log("[step 1] No admin users to rename (already done).");
  }

  const opsResult = await db
    .update(usersTable)
    .set({ role: "channel_manager" })
    .where(or(eq(usersTable.role, "ops"), eq(usersTable.role, "operations")))
    .returning({ id: usersTable.id, username: usersTable.username });

  if (opsResult.length > 0) {
    console.log(`[step 1] ${opsResult.length} user(s): ops/operations → channel_manager`);
    opsResult.forEach(u => console.log(`         ${u.username} (id=${u.id})`));
  } else {
    console.log("[step 1] No ops/operations users to rename (already done).");
  }

  // ── Step 2: Named demo-user channelScope fixes ──────────────────────────────
  // Explicit list covers all known demo users regardless of their current scope.

  const namedFixes: Array<{ username: string; channelScope: string }> = [
    { username: "ops1",   channelScope: "coffee" },
    { username: "ops2",   channelScope: "coffee" },
    { username: "sales1", channelScope: "coffee" },
    { username: "sales2", channelScope: "coffee" },
    { username: "sales3", channelScope: "coffee" },
  ];

  console.log("\n[step 2] Named channelScope fixes:");
  for (const fix of namedFixes) {
    const result = await db
      .update(usersTable)
      .set({ channelScope: fix.channelScope })
      .where(eq(usersTable.username, fix.username))
      .returning({ id: usersTable.id, channelScope: usersTable.channelScope });

    if (result.length > 0) {
      console.log(`         ${fix.username.padEnd(10)} channelScope → ${fix.channelScope}`);
    } else {
      console.log(`         ${fix.username.padEnd(10)} not found — skipped.`);
    }
  }

  // ── Step 3: Catch-all — channel_manager / sales users still on "all" ────────
  // Covers any extra users not in the named list above.
  // Defaults them to "coffee" (the current active channel).

  const catchAllResult = await db
    .update(usersTable)
    .set({ channelScope: "coffee" })
    .where(
      and(
        or(
          eq(usersTable.role, "channel_manager"),
          eq(usersTable.role, "sales"),
        ),
        eq(usersTable.channelScope, "all"),
      ),
    )
    .returning({ id: usersTable.id, username: usersTable.username, role: usersTable.role });

  if (catchAllResult.length > 0) {
    console.log(`\n[step 3] Catch-all: ${catchAllResult.length} channel_manager/sales user(s) had channelScope=all → defaulted to "coffee":`);
    catchAllResult.forEach(u =>
      console.log(`         ${u.username.padEnd(12)} (${u.role})  id=${u.id}`),
    );
  } else {
    console.log("\n[step 3] Catch-all: no channel_manager/sales users left with channelScope=all. ✓");
  }

  // ── Step 4: Insert gm1 (general_manager) if not already present ────────────

  const existingGm = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, "gm1"));

  if (existingGm.length === 0) {
    await db.insert(usersTable).values({
      username:     "gm1",
      passwordHash: hashPassword("gm123"),
      fullName:     "Maria Jensen",
      email:        "gm1@coffeedist.com",
      role:         "general_manager",
      channelScope: "all",
      active:       true,
    });
    console.log("\n[step 4] gm1 (general_manager, all) created.");
  } else {
    console.log("\n[step 4] gm1 already exists — skipped.");
  }

  // ── Final summary ───────────────────────────────────────────────────────────

  console.log("\n[migrate-roles-v2] Final user roster:");
  const allUsers = await db
    .select({
      username:     usersTable.username,
      role:         usersTable.role,
      channelScope: usersTable.channelScope,
      active:       usersTable.active,
    })
    .from(usersTable)
    .orderBy(usersTable.username);

  allUsers.forEach(u =>
    console.log(
      `  ${u.username.padEnd(12)} role=${u.role.padEnd(18)} channelScope=${u.channelScope.padEnd(12)} active=${u.active}`,
    ),
  );

  console.log("\n[migrate-roles-v2] Migration complete.");
  await pool.end();
}

main().catch(async (err) => {
  console.error("[migrate-roles-v2] Fatal error:", err);
  await pool.end();
  process.exit(1);
});
