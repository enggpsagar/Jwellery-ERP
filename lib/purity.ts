import { PurityType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const DEFAULT_FINENESS: Record<PurityType, number> = {
  GOLD_24K: 100.0,
  GOLD_22K: 91.6,
  GOLD_20K: 83.3,
  GOLD_18K: 75.0,
  SILVER_999: 99.9,
  SILVER_925: 92.5,
  PLATINUM_950: 95.0,
  PLATINUM_900: 90.0,
  // Diamonds aren't valued by a fine-metal percentage the way Gold/Silver/
  // Platinum are — kept at 100% (same convention as OTHER) purely so this
  // stays a total Record<PurityType, number> without a special case in
  // toFineWeight; nothing meaningfully divides a diamond's weight down.
  DIAMOND: 100.0,
  OTHER: 100.0,
};

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

export const PURITY_LABELS: Record<PurityType, string> = {
  GOLD_24K: "Gold 24K",
  GOLD_22K: "Gold 22K",
  GOLD_20K: "Gold 20K",
  GOLD_18K: "Gold 18K",
  SILVER_999: "Silver 999",
  SILVER_925: "Silver 925",
  PLATINUM_950: "Platinum 950",
  PLATINUM_900: "Platinum 900",
  DIAMOND: "Diamond",
  OTHER: "Other",
};

export function getPurityLabel(purity: PurityType) {
  return PURITY_LABELS[purity];
}

/** Every purity as a ready-to-render {value, label} option — the single source for purity dropdowns app-wide, so a new PurityType only needs to be added here once. */
export const PURITY_SELECT_OPTIONS: { value: PurityType; label: string }[] = (
  Object.keys(PURITY_LABELS) as PurityType[]
).map((value) => ({ value, label: PURITY_LABELS[value] }));

export function toFineWeight(
  weight: number | null | undefined,
  purity: PurityType | null | undefined,
  fineness: Record<PurityType, number>,
): number {
  if (!weight) return 0;
  const percent = fineness[purity ?? PurityType.OTHER] ?? 100;
  return (weight * percent) / 100;
}

export const GRAMS_PER_CARAT = 0.2;

/** Stone weight is always stored/calculated in grams (same convention as
 * grossWeight/netWeight/dmoWeight) — this converts a value a user typed in
 * a chosen unit into grams before it's used in any weight math or sent to
 * a server action. Shared across every line-item form's Stone Weight
 * field, unlike the per-file business-logic helpers elsewhere in this
 * codebase, since a unit conversion factor must never drift between them. */
export function stoneWeightToGrams(value: number, unit: "GRAM" | "CARAT"): number {
  return unit === "CARAT" ? value * GRAMS_PER_CARAT : value;
}

/**
 * True for a metal weighed and priced by carat rather than by gram —
 * Diamond, and a loose Stone product line (a stand-alone gemstone
 * `StoreMetal`, not the stone embedded in a metal piece — that's the
 * separate `stoneWeight`/`defaultStoneWeight` fields, always in grams).
 * Matched the same way `classifyMetalName` / product-form's
 * `classifyPurityFamily` do: a case-insensitive substring on the metal's
 * free-text name. Kept separate from `classifyMetalName`'s `MetalFamily`
 * (tied to the `BusinessUnit` enum, which has no Stone unit) so this stays a
 * pure, local carat/weight concern shared by every line-item form.
 */
export function isCaratWeighedMetal(metalName: string | null | undefined): boolean {
  const lower = (metalName ?? "").toLowerCase();
  return lower.includes("diamond") || lower.includes("stone");
}
