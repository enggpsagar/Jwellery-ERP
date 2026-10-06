// lib/purity-db.ts
// The DB-backed half of lib/purity.ts. Split out because lib/purity.ts is
// imported by client components for its pure helpers, and anything importing
// lib/prisma pulls the Postgres driver (pg) into the browser bundle — which
// fails the build now that Prisma runs through a driver adapter.
import "server-only";

import { PurityType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { DEFAULT_FINENESS, DEFAULT_GRAMS_PER_CARAT } from "@/lib/purity";

/**
 * Fine-gold (or fine-silver) percentage per PurityType for a store, lazily
 * seeded from DEFAULT_FINENESS on first read so every store always has a
 * complete table without a separate provisioning step (same pattern as
 * getBusinessSettings()'s lazy-create-on-first-read).
 */
export async function getFinenessMap(
  storeId: string,
): Promise<Record<PurityType, number>> {
  const rows = await prisma.purityFineness.findMany({ where: { storeId } });

  const map = { ...DEFAULT_FINENESS };
  for (const row of rows) {
    map[row.purity] = Number(row.finenessPercent);
  }

  const missing = (Object.keys(DEFAULT_FINENESS) as PurityType[]).filter(
    (purity) => !rows.some((row) => row.purity === purity),
  );

  if (missing.length > 0) {
    await prisma.purityFineness.createMany({
      data: missing.map((purity) => ({
        storeId,
        purity,
        finenessPercent: DEFAULT_FINENESS[purity],
      })),
      skipDuplicates: true,
    });
  }

  return map;
}

/**
 * Grams-per-carat per PurityType for a store, lazily seeded from
 * DEFAULT_GRAMS_PER_CARAT on first read — same pattern as getFinenessMap.
 * Server-only (reads the DB), so every client form that needs this fetches
 * it once server-side and receives the resolved map as a prop; the actual
 * per-keystroke conversion then runs client-side via resolveGramsPerCarat.
 */
export async function getGramsPerCaratMap(
  storeId: string,
): Promise<Record<PurityType, number>> {
  const rows = await prisma.caratConversionRate.findMany({ where: { storeId } });

  const map = { ...DEFAULT_GRAMS_PER_CARAT };
  for (const row of rows) {
    map[row.purity] = Number(row.gramsPerCarat);
  }

  const missing = (Object.keys(DEFAULT_GRAMS_PER_CARAT) as PurityType[]).filter(
    (purity) => !rows.some((row) => row.purity === purity),
  );

  if (missing.length > 0) {
    await prisma.caratConversionRate.createMany({
      data: missing.map((purity) => ({
        storeId,
        purity,
        gramsPerCarat: DEFAULT_GRAMS_PER_CARAT[purity],
      })),
      skipDuplicates: true,
    });
  }

  return map;
}
