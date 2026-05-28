/**
 * migrate-roles-v2.ts
 *
 * Idempotent migration from V1 roles to V2.5 roles.
 *
 * Changes:
 *   admin       → owner_admin
 *   ops         → channel_manager  (handles both "ops" and "operations")
 *   operations  → channel_manager
 *   ops1        channelScope: all → coffee
 *   sales1      channelScope: horeca → coffee
 *   Inserts gm1 (general_manager) if not already present
 *
 * Safe to run multiple times — every step is idempotent.
 * Never deletes data, never resets the database.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run migrate-roles-v2
 */

import { scryptSync, randomBytes } from "node:crypto";
import { db, pool, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  console.log("[migrate-roles-v2] Starting V2.5 role migration...");

  // 1. admin → owner_admin
  const adminResult = await db
    .update(usersTable)
    .set({ role: "owner_admin" })
    .where(eq(usersTable.role, "admin"))
    .returning({ id: usersTable.id, username: usersTable.username });

  if (adminResult.length > 0) {
    console.log(`[migrate-roles-v2] ${adminResult.length} user(s) migrated: admin → owner_admin`);
    adminResult.forEach(u => console.log(`  username=${u.username} id=${u.id}`));
  } else {
    console.log("[migrate-roles-v2] No users with role=admin found (already migrated or not seeded).");
  }

  // 2. ops / operations → channel_manager (handles both spellings)
  const opsResult = await db
    .update(usersTable)
    .set({ role: "channel_manager" })
    .where(or(eq(usersTable.role, "ops"), eq(usersTable.role, "operations")))
    .returning({ id: usersTable.id, username: usersTable.username });

  if (opsResult.length > 0) {
    console.log(`[migrate-roles-v2] ${opsResult.length} user(s) migrated: ops/operations → channel_manager`);
    opsResult.forEach(u => console.log(`  username=${u.username} id=${u.id}`));
  } else {
    console.log("[migrate-roles-v2] No users with role=ops/operations found (already migrated or not seeded).");
  }

  // 3. ops1 channelScope: fix to "coffee"
  const ops1Result = await db
    .update(usersTable)
    .set({ channelScope: "coffee" })
    .where(eq(usersTable.username, "ops1"))
    .returning({ id: usersTable.id, channelScope: usersTable.channelScope });

  if (ops1Result.length > 0) {
    console.log(`[migrate-roles-v2] ops1 channelScope set to "coffee".`);
  } else {
    console.log("[migrate-roles-v2] ops1 user not found — skipping channelScope fix.");
  }

  // 4. sales1 channelScope: "horeca" → "coffee"
  const sales1Result = await db
    .update(usersTable)
    .set({ channelScope: "coffee" })
    .where(eq(usersTable.username, "sales1"))
    .returning({ id: usersTable.id, channelScope: usersTable.channelScope });

  if (sales1Result.length > 0) {
    console.log(`[migrate-roles-v2] sales1 channelScope set to "coffee".`);
  } else {
    console.log("[migrate-roles-v2] sales1 user not found — skipping channelScope fix.");
  }

  // 5. Insert gm1 (general_manager) if not already present
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
    console.log("[migrate-roles-v2] gm1 (general_manager) user created.");
  } else {
    console.log("[migrate-roles-v2] gm1 already exists — skipping insert.");
  }

  // 6. Summary: print all users and their current roles
  console.log("\n[migrate-roles-v2] Current user roles after migration:");
  const allUsers = await db
    .select({ username: usersTable.username, role: usersTable.role, channelScope: usersTable.channelScope })
    .from(usersTable)
    .orderBy(usersTable.username);

  allUsers.forEach(u =>
    console.log(`  ${u.username.padEnd(12)} role=${u.role.padEnd(18)} channelScope=${u.channelScope}`)
  );

  console.log("\n[migrate-roles-v2] Migration complete.");
  await pool.end();
}

main().catch(async (err) => {
  console.error("[migrate-roles-v2] Fatal error:", err);
  await pool.end();
  process.exit(1);
});
