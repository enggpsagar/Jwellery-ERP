// Pure-metal ("fine", 24K / 999) weight for every stored metal line.
//
// Every row that carries a metal weight (InventoryStock, PurchaseItem,
// InvoiceItem, KachaInvoiceItem, QuotationItem) also stores `fineWeight`,
// so that every balance and report can total pure metal: 100 g of 22K
// counts as 91.6 g, never as 100 g. The physical netWeight is kept as-is —
// it's what gets printed, tagged and priced.
//
// Rule (keep in sync with the backfill SQL in migration
// 20261002140000_add_fine_weight, which scripts/backfill-fine-weights.ts
// re-runs for freshly seeded databases):
//   - metal with StoreMetal.hasPurity → netWeight × fineness / 100, where
//     fineness = the metal's own purity row (StoreMetalPurity, matched on
//     metal + purityLabel) → else the store's PurityFineness for the legacy
//     purity enum → else 100;
//   - any other metal (no purity concept, gemstones) → netWeight itself.
// Fineness is a ratio, so fineWeight is in the same unit and on the same
// per-piece/per-line basis as the netWeight it came from.
import "server-only";

import type { Prisma, PurityType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFinenessMap } from "@/lib/purity";

export type FineWeightLine = {
  metalTypeId?: string | null;
  purityLabel?: string | null;
  purity?: PurityType | string | null;
  netWeight?: number | string | Prisma.Decimal | null;
};

export type FineWeightResolver = (line: FineWeightLine) => number | null;

function round5(value: number) {
  return Math.round(value * 100000) / 100000;
}

/**
 * Loads the store's metals and fineness tables once and returns a resolver
 * for any number of lines. Call it before a transaction (getFinenessMap may
 * lazily seed rows through the main client).
 */
export async function getFineWeightResolver(storeId: string): Promise<FineWeightResolver> {
  const [metals, purities, enumFineness] = await Promise.all([
    prisma.storeMetal.findMany({
      where: { storeId },
      select: { id: true, hasPurity: true },
    }),
    prisma.storeMetalPurity.findMany({
      where: { storeId },
      select: { storeMetalId: true, label: true, finenessPercent: true },
    }),
    getFinenessMap(storeId),
  ]);

  const metalById = new Map(metals.map((metal) => [metal.id, metal]));
  const finenessByMetalLabel = new Map(
    purities.map((row) => [`${row.storeMetalId}::${row.label}`, Number(row.finenessPercent)]),
  );

  return (line) => {
    if (line.netWeight === null || line.netWeight === undefined || line.netWeight === "") return null;
    const net = Number(line.netWeight);
    if (!Number.isFinite(net)) return null;

    const metal = line.metalTypeId ? metalById.get(line.metalTypeId) : undefined;
    if (!metal?.hasPurity) return round5(net);

    const byLabel = line.purityLabel
      ? finenessByMetalLabel.get(`${metal.id}::${line.purityLabel}`)
      : undefined;
    const legacy = line.purity as PurityType | null | undefined;
    const fineness = byLabel ?? (legacy ? enumFineness[legacy] : undefined) ?? 100;

    return round5((net * fineness) / 100);
  };
}

/** Convenience for a one-off line (e.g. a single stock row update). */
export async function resolveFineWeight(storeId: string, line: FineWeightLine) {
  return (await getFineWeightResolver(storeId))(line);
}
