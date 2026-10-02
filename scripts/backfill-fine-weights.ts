// Fills InventoryStock/InvoiceItem/PurchaseItem/KachaInvoiceItem/
// QuotationItem.fineWeight wherever it's still null, by re-running the
// backfill UPDATEs of migration 20261002140000_add_fine_weight — the single
// copy of the SQL rule, kept identical to lib/fine-weight.ts. Each UPDATE
// only touches rows with fineWeight IS NULL, so this is safe to re-run.
//
// Needed after the demo seeds: they insert rows straight through Prisma,
// bypassing the app's write paths that set fineWeight. Run with
// `pnpm db:backfill:fine-weights`.
import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const sql = readFileSync(
    path.join(__dirname, "../prisma/migrations/20261002140000_add_fine_weight/migration.sql"),
    "utf8",
  );
  const updates = sql
    .split(";")
    .map((statement) => statement.replace(/^\s*--.*$/gm, "").trim())
    .filter((statement) => statement.startsWith("UPDATE"));

  for (const statement of updates) {
    const table = /UPDATE "(\w+)"/.exec(statement)?.[1];
    const count = await prisma.$executeRawUnsafe(statement);
    console.log(`${table}: ${count} row(s) backfilled`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
