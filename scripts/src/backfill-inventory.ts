/**
 * Idempotent inventory backfill.
 *
 * Safe to run on a populated database — it NEVER deletes or overwrites
 * existing data. It only inserts rows that are genuinely missing.
 *
 * What it does:
 *   1. Creates the 3 inventory pools if the table is empty.
 *   2. For every product × pool combination that has no product_inventory
 *      row, inserts one with quantityAvailable = 100, quantityReserved = 0.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run backfill-inventory
 */

import {
  db,
  pool,
  productsTable,
  inventoryPoolsTable,
  productInventoryTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

const DEMO_POOLS = [
  { name: "physical_sales", label: "Physical Sales" },
  { name: "online_sales",   label: "Online Sales" },
  { name: "free_samples",   label: "Free Samples" },
];

const DEFAULT_QUANTITY = 100;

async function backfillPools(): Promise<Array<{ id: number; name: string; label: string }>> {
  const existing = await db.select().from(inventoryPoolsTable);

  if (existing.length > 0) {
    console.log(`Pools already present (${existing.length} found) — skipping pool insert.`);
    return existing;
  }

  console.log("No pools found — inserting 3 default pools…");
  const inserted = await db
    .insert(inventoryPoolsTable)
    .values(DEMO_POOLS)
    .returning();
  console.log(`  Inserted pools: ${inserted.map(p => p.name).join(", ")}`);
  return inserted;
}

async function backfillProductInventory(
  pools: Array<{ id: number; name: string; label: string }>,
): Promise<void> {
  const products = await db.select().from(productsTable);

  if (products.length === 0) {
    console.log("No products found — nothing to backfill.");
    return;
  }

  console.log(`Found ${products.length} product(s) and ${pools.length} pool(s).`);

  let inserted = 0;
  let skipped = 0;

  for (const product of products) {
    for (const p of pools) {
      const [existing] = await db
        .select({ id: productInventoryTable.id })
        .from(productInventoryTable)
        .where(
          and(
            eq(productInventoryTable.productId, product.id),
            eq(productInventoryTable.poolId, p.id),
          ),
        );

      if (existing) {
        skipped++;
        continue;
      }

      await db.insert(productInventoryTable).values({
        productId: product.id,
        poolId: p.id,
        quantityAvailable: DEFAULT_QUANTITY,
        quantityReserved: 0,
      });

      console.log(
        `  + "${product.productName}" [${product.sku}] → ${p.name}: ${DEFAULT_QUANTITY} available`,
      );
      inserted++;
    }
  }

  console.log(
    `\nDone. Inserted: ${inserted} row(s), already present (skipped): ${skipped} row(s).`,
  );
}

async function main() {
  console.log("=== Inventory backfill ===\n");

  const pools = await backfillPools();
  await backfillProductInventory(pools);

  console.log("\nBackfill complete.");
  await pool.end();
}

main().catch(async (err) => {
  console.error("Backfill failed:", err);
  await pool.end();
  process.exit(1);
});
