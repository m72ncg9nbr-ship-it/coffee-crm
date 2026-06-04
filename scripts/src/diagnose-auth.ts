/**
 * diagnose-auth.ts
 *
 * Deep server-side auth diagnostic.
 * Answers every question needed to find why login fails even after
 * repair-demo-users ran successfully.
 *
 * Prints:
 *  1. DATABASE_URL identity (host + db name only, credentials masked)
 *  2. SELECT current_database() result
 *  3. Full admin row: username, role, channel_scope, active
 *  4. passwordHash length + first 10 chars (proves format)
 *  5. verifyPassword("admin123", hash) using the EXACT same
 *     implementation as artifacts/api-server/src/lib/auth.ts
 *  6. verifyPassword using a self-contained inline copy (rules out
 *     import/module caching issues)
 *  7. Live HTTP POST to /api/auth/login on every known localhost port
 *     so we can see if the API server is hitting a different database
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run diagnose-auth
 */

import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { db, pool, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── 1 & 2: Database identity ───────────────────────────────────────────────

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    // Show protocol, host, port, and database path. Mask user:password.
    const user = u.username ? `${u.username}:***@` : "";
    return `${u.protocol}//${user}${u.host}${u.pathname}`;
  } catch {
    return "(could not parse DATABASE_URL)";
  }
}

// ── 5: Exact same verifyPassword as api-server/src/lib/auth.ts ─────────────
// We import the shared db package but replicate the crypto function
// verbatim to rule out any difference in the compiled build.

function verifyPasswordShared(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const derivedBuffer = scryptSync(password, salt, 64);
  return timingSafeEqual(hashBuffer, derivedBuffer);
}

// ── 6: Inline hashPassword for a round-trip test ───────────────────────────

function hashPasswordInline(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// ── 7: Raw HTTP login attempt ──────────────────────────────────────────────

async function httpLogin(port: number, username: string, password: string): Promise<string> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(3000),
    });
    const text = await res.text();
    return `HTTP ${res.status}: ${text.slice(0, 200)}`;
  } catch (e: any) {
    return `CONNECT ERROR: ${e.message}`;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  diagnose-auth.ts — Coffee CRM auth diagnostic");
  console.log("=".repeat(60));
  console.log();

  // ── Section 1: Environment / database identity ─────────────────────────
  console.log("──────────────────────────────────────────────");
  console.log("SECTION 1: DATABASE_URL identity");
  console.log("──────────────────────────────────────────────");

  const rawUrl = process.env.DATABASE_URL ?? "(not set)";
  console.log(`  DATABASE_URL (masked): ${maskUrl(rawUrl)}`);
  console.log(`  DATABASE_URL set:      ${rawUrl !== "(not set)" ? "YES" : "NO ← PROBLEM"}`);

  // Confirm with a raw pool query so we can see exactly which DB
  try {
    const dbNameRow = await pool.query("SELECT current_database() AS db, current_user AS usr, version() AS ver");
    const { db: dbName, usr, ver } = dbNameRow.rows[0];
    console.log(`  current_database():    ${dbName}`);
    console.log(`  current_user:          ${usr}`);
    console.log(`  postgres version:      ${String(ver).split(" ").slice(0, 2).join(" ")}`);
  } catch (e: any) {
    console.log(`  pool.query FAILED: ${e.message}`);
  }

  console.log();

  // ── Section 2: admin user row ──────────────────────────────────────────
  console.log("──────────────────────────────────────────────");
  console.log("SECTION 2: admin user in DB");
  console.log("──────────────────────────────────────────────");

  const [admin] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, "admin"));

  if (!admin) {
    console.log("  ❌ admin user NOT FOUND in database");
    console.log("     → repair-demo-users wrote to a DIFFERENT database");
  } else {
    console.log(`  username:      ${admin.username}`);
    console.log(`  role:          ${admin.role}`);
    console.log(`  channelScope:  ${admin.channelScope}`);
    console.log(`  active:        ${admin.active}`);
    console.log(`  hash length:   ${admin.passwordHash.length} chars`);
    console.log(`  hash prefix:   ${admin.passwordHash.slice(0, 10)}…`);
    console.log(`  hash format:   ${admin.passwordHash.includes(":") ? "contains ':' ← looks like salt:hash ✓" : "NO ':' found ← WRONG FORMAT ❌"}`);

    const colonCount = (admin.passwordHash.match(/:/g) ?? []).length;
    console.log(`  colon count:   ${colonCount} (expected 1)`);

    // Validate format: salt should be 32 hex chars, hash 128 hex chars
    const [salt, hashPart] = admin.passwordHash.split(":");
    console.log(`  salt length:   ${salt?.length ?? 0} chars (expected 32)`);
    console.log(`  hash part len: ${hashPart?.length ?? 0} chars (expected 128)`);
  }

  console.log();

  // ── Section 3: verifyPassword tests ───────────────────────────────────
  console.log("──────────────────────────────────────────────");
  console.log("SECTION 3: verifyPassword tests");
  console.log("──────────────────────────────────────────────");

  if (admin) {
    // 3a: shared implementation (verbatim copy of api-server/src/lib/auth.ts)
    const result3a = verifyPasswordShared("admin123", admin.passwordHash);
    console.log(`  verifyPassword("admin123", stored hash): ${result3a ? "✓ TRUE" : "❌ FALSE"}`);

    // 3b: wrong password — should be false
    const result3b = verifyPasswordShared("wrongpassword", admin.passwordHash);
    console.log(`  verifyPassword("wrongpassword", hash):   ${result3b ? "❌ TRUE (hash fn broken)" : "✓ FALSE (correct)"}`);

    // 3c: round-trip sanity check
    const freshHash = hashPasswordInline("admin123");
    const result3c = verifyPasswordShared("admin123", freshHash);
    console.log(`  round-trip test (fresh hash):            ${result3c ? "✓ TRUE (scrypt works)" : "❌ FALSE (scrypt broken)"}`);

    // 3d: check what happens with common wrong format
    if (!admin.passwordHash.includes(":")) {
      console.log("  ❌ Hash is NOT in 'salt:hash' format — verifyPassword will always return false");
      console.log(`     Stored value: ${admin.passwordHash.slice(0, 40)}…`);
    }

    // 3e: check if hash might be bcrypt ($2b$…)
    if (admin.passwordHash.startsWith("$2")) {
      console.log("  ❌ Hash looks like bcrypt ($2…) but verifyPassword uses scrypt!");
    }
  } else {
    console.log("  (skipped — admin not found)");
  }

  console.log();

  // ── Section 4: All users summary ──────────────────────────────────────
  console.log("──────────────────────────────────────────────");
  console.log("SECTION 4: All users in this database");
  console.log("──────────────────────────────────────────────");

  const allUsers = await db
    .select({
      username:     usersTable.username,
      role:         usersTable.role,
      channelScope: usersTable.channelScope,
      active:       usersTable.active,
      passwordHash: usersTable.passwordHash,
    })
    .from(usersTable)
    .orderBy(usersTable.username);

  if (allUsers.length === 0) {
    console.log("  ❌ NO USERS FOUND — completely different database or empty table");
  } else {
    for (const u of allUsers) {
      const hashOk = u.passwordHash.includes(":") && u.passwordHash.length > 50;
      console.log(
        `  ${u.username.padEnd(12)} role=${u.role.padEnd(18)} active=${String(u.active).padEnd(6)} hash=${hashOk ? "ok" : "❌BAD"}(len=${u.passwordHash.length})`,
      );
    }
  }

  console.log();

  // ── Section 5: Live API HTTP test ──────────────────────────────────────
  console.log("──────────────────────────────────────────────");
  console.log("SECTION 5: Live API HTTP login test");
  console.log("  (tests whether running api-server uses same DB)");
  console.log("──────────────────────────────────────────────");

  const ports = [8080, 8081, 8082, 3000, 3001, 5000, 5001];
  let apiFound = false;

  for (const port of ports) {
    const result = await httpLogin(port, "admin", "admin123");
    const isConnError = result.startsWith("CONNECT ERROR");
    if (!isConnError) {
      apiFound = true;
      const icon = result.startsWith("HTTP 200") ? "✓" : "❌";
      console.log(`  port ${port}: ${icon} ${result}`);
    } else {
      console.log(`  port ${port}: (not listening)`);
    }
  }

  if (!apiFound) {
    console.log("  ❌ No API server found on any standard port.");
    console.log("     The api-server may not be running, or is on a non-standard port.");
  }

  console.log();

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("──────────────────────────────────────────────");
  console.log("SUMMARY / LIKELY ROOT CAUSE");
  console.log("──────────────────────────────────────────────");

  if (!admin) {
    console.log("  ❌ admin NOT in this database.");
    console.log("     repair-demo-users wrote to a DIFFERENT database.");
    console.log("     The api-server is probably using a different DATABASE_URL.");
    console.log("     Check: Replit Secrets vs. postgresql-16 module DATABASE_URL.");
  } else if (admin && !verifyPasswordShared("admin123", admin.passwordHash)) {
    console.log("  ❌ admin exists but password verification FAILS.");
    console.log("     The stored hash doesn't match 'admin123'.");
    console.log("     Check hash format and scrypt params.");
  } else if (admin && verifyPasswordShared("admin123", admin.passwordHash)) {
    console.log("  ✓ admin exists and password verifies correctly in THIS database.");
    console.log("  ❓ If the API still fails, the API server is using a DIFFERENT database.");
    console.log("     Look at HTTP test results above to confirm.");
    console.log("     Check the api-server process's actual DATABASE_URL env var.");
  }

  console.log();
  await pool.end();
}

main().catch(async (err) => {
  console.error("[diagnose-auth] Fatal error:", err);
  await pool.end();
  process.exit(1);
});
