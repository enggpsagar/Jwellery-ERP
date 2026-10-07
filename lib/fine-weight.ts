// Pure-metal ("fine", 24K / 999) weight for every stored metal line.
//
// Every row that carries a metal weight (InventoryStock, PurchaseItem,
// InvoiceItem, KachaInvoiceItem, QuotationItem, PieceComponent) also stores
// `fineWeight`, so that every balance and report can total pure metal: 100 g
// of 22K counts as 91.6 g, never as 100 g. The physical netWeight is kept
// as-is — it's what gets printed, tagged and priced.
//
// The formula itself lives in lib/weight-calc.ts (calcFineWeight — shared
// with every form's live preview) and follows the store's Settings > Weights
// (basis Net/Gross, wastage on top, rounding). This file only loads what it
// needs: the store's settings, metals and fineness tables. With the default
// settings the rule is exactly the backfill SQL in migration
// 20261002140000_add_fine_weight (which scripts/backfill-fine-weights.ts
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
import { getFinenessMap } from "@/lib/purity-db";
import { loadWeightSettings } from "@/lib/weight-settings.server";
import {
  calcFineWeight,
  deriveNetWeight,
  normalizeWastagePercent,
  type NetWeightInput,
  type WeightSettings,
} from "@/lib/weight-calc";

type WeightValue = number | string | Prisma.Decimal | null | undefined;

export type FineWeightLine = {
  metalTypeId?: string | null;
  purityLabel?: string | null;
  purity?: PurityType | string | null;
  netWeight?: WeightValue;
  /** Used when Settings > Weights' fine basis is Gross (falls back to net). */
  grossWeight?: WeightValue;
  /** The line's own wastage % — only counts with "add wastage to fine". */
  wastagePercent?: WeightValue;
};

export type FineWeightResolver = ((line: FineWeightLine) => number | null) & {
  settings: WeightSettings;
  /** Fineness % the line's metal + purity resolves to (100 for none). */
  finenessOf: (line: FineWeightLine) => number;
  hasPurity: (metalTypeId: string | null | undefined) => boolean;
  /** The purity's default wastage % (Settings › Metals & Categories), or null. */
  defaultWastage: (line: FineWeightLine) => number | null;
  /**
   * The wastage % a line stores: its own value when given (null / "" /
   * 0 = none), its purity's default when not given at all (undefined).
   */
  wastageFor: (line: FineWeightLine) => number | null;
  /** Net = gross − deductions, per the store's settings (null = no gross). */
  deriveNet: (input: NetWeightInput) => number | null;
  /**
   * What a line stores: its wastage % (wastageFor; null for a metal without
   * purity) and the fine weight worked out with it.
   */
  line: (line: FineWeightLine) => { wastagePercent: number | null; fineWeight: number | null };
};

/**
 * Loads the store's weight settings, metals and fineness tables once and
 * returns a resolver for any number of lines. Call it before a transaction
 * (getFinenessMap may lazily seed rows through the main client).
 * `options.settings` overrides the stored settings (the recalculation uses
 * the settings being applied).
 */
export async function getFineWeightResolver(
  storeId: string,
  options: { settings?: WeightSettings } = {},
): Promise<FineWeightResolver> {
  const [metals, purities, enumFineness, settings] = await Promise.all([
    prisma.storeMetal.findMany({
      where: { storeId },
      select: { id: true, hasPurity: true, primaryUnit: true },
    }),
    prisma.storeMetalPurity.findMany({
      where: { storeId },
      select: { storeMetalId: true, label: true, finenessPercent: true, wastagePercent: true },
    }),
    getFinenessMap(storeId),
    options.settings ? Promise.resolve(options.settings) : loadWeightSettings(storeId),
  ]);

  const metalById = new Map(metals.map((metal) => [metal.id, metal]));
  const purityByMetalLabel = new Map(purities.map((row) => [`${row.storeMetalId}::${row.label}`, row]));

  const finenessOf = (line: FineWeightLine) => {
    const metal = line.metalTypeId ? metalById.get(line.metalTypeId) : undefined;
    if (!metal?.hasPurity) return 100;
    const byLabel = line.purityLabel ? purityByMetalLabel.get(`${metal.id}::${line.purityLabel}`) : undefined;
    const legacy = line.purity as PurityType | null | undefined;
    return (byLabel ? Number(byLabel.finenessPercent) : undefined) ?? (legacy ? enumFineness[legacy] : undefined) ?? 100;
  };

  const defaultWastage = (line: FineWeightLine) => {
    if (!line.metalTypeId || !line.purityLabel) return null;
    const row = purityByMetalLabel.get(`${line.metalTypeId}::${line.purityLabel}`);
    return normalizeWastagePercent(row?.wastagePercent ?? null);
  };

  const resolve = (line: FineWeightLine) => {
    const metal = line.metalTypeId ? metalById.get(line.metalTypeId) : undefined;
    return calcFineWeight(
      {
        netWeight: line.netWeight,
        grossWeight: line.grossWeight,
        finenessPercent: finenessOf(line),
        wastagePercent: line.wastagePercent,
        hasPurity: Boolean(metal?.hasPurity),
        unit: metal?.primaryUnit ?? "GRAM",
      },
      settings,
    );
  };

  const hasPurity = (metalTypeId: string | null | undefined) =>
    Boolean(metalTypeId && metalById.get(metalTypeId)?.hasPurity);
  const wastageFor = (line: FineWeightLine) =>
    line.wastagePercent === undefined ? defaultWastage(line) : normalizeWastagePercent(line.wastagePercent);

  return Object.assign(resolve, {
    settings,
    finenessOf,
    hasPurity,
    defaultWastage,
    wastageFor,
    deriveNet: (input: NetWeightInput) => deriveNetWeight(input, settings),
    line: (line: FineWeightLine) => {
      const wastagePercent = hasPurity(line.metalTypeId) ? wastageFor(line) : null;
      return { wastagePercent, fineWeight: resolve({ ...line, wastagePercent }) };
    },
  });
}

type LineWithWeights = FineWeightLine & {
  /** A multi-part line's resolved rows (lib/piece-components.server.ts). */
  piece?: { summary: { fineWeight: number | null; wastagePercent: number | null } } | null;
};

/**
 * Every document line's stored wastage % and fine weight, through the one
 * resolver: a multi-part line takes its piece summary (first metal's), any
 * other line resolver.line(). Call once after the lines are final (locked
 * stock facts, resolved pieces) and write `fineWeight` / `wastagePercent`.
 */
export function withLineWeights<T extends LineWithWeights>(
  items: T[],
  fineOf: FineWeightResolver,
): (T & { fineWeight: number | null; wastagePercent: number | null })[] {
  return items.map((item) => ({ ...item, ...lineWeights(item, fineOf) }));
}

/** One line's { fineWeight, wastagePercent } — see withLineWeights. */
export function lineWeights(item: LineWithWeights, fineOf: FineWeightResolver) {
  if (item.piece) {
    return { fineWeight: item.piece.summary.fineWeight, wastagePercent: item.piece.summary.wastagePercent };
  }
  return fineOf.line(item);
}

/** lineWeights for a Prisma create/update payload (undefined = leave unset). */
export function storedLineWeights(item: LineWithWeights, fineOf: FineWeightResolver) {
  const { fineWeight, wastagePercent } = lineWeights(item, fineOf);
  return { fineWeight: fineWeight ?? undefined, wastagePercent };
}

/** Convenience for a one-off line (e.g. a single stock row update). */
export async function resolveFineWeight(storeId: string, line: FineWeightLine) {
  return (await getFineWeightResolver(storeId))(line);
}
