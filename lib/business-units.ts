// lib/business-units.ts
//
// Pure constants/helpers only — no server-only imports (next/headers, prisma)
// — so this can be imported from client components too (e.g. ledger-view.tsx
// uses classifyMetalName to decide how to render a row). Server-side lookups
// (the live, per-store list of selectable units) live in
// lib/business-units.server.ts.
//
// `businessUnits` used to be a fixed `BusinessUnit` enum array
// (MONEY | GOLD | SILVER | DIAMOND) — that enum has been removed from the
// schema. A "unit" is now always either the literal string "MONEY" or a live
// StoreMetal.id; see BusinessUnitOption in business-units.server.ts. The
// MONEY sentinel is kept here as a plain string constant so both this file
// and business-units.server.ts share one literal.
export const MONEY_UNIT = "MONEY" as const

/**
 * The sentinel is never carat-based, so `formatUnitValue` needs to know
 * whether a resolved (non-money) unit is a gemstone (carats) or a plain
 * metal (grams) — this is StoreMetal.isGemstone, not a name guess, wherever
 * the caller has it. See classifyMetalName below for the bare-name-string
 * fallback used by call sites that only have a historical name to go on.
 */
export type UnitFormatHint = { value: string; isGemstone: boolean } | typeof MONEY_UNIT

type MetalFamily = "GOLD" | "SILVER" | "DIAMOND" | "OTHER"

const METAL_NAME_MATCHERS: Record<Exclude<MetalFamily, "OTHER">, string> = {
  GOLD: "gold",
  SILVER: "silver",
  DIAMOND: "diamond",
}

/**
 * StoreMetal is a free-text, store-managed list (see Taxonomy settings), so
 * there's no fixed foreign key to "the Gold row" — entries are matched to a
 * business unit by a case-insensitive substring on the metal's name (e.g. a
 * StoreMetal named "Gold 22K" or "Yellow Gold" both classify as GOLD).
 *
 * StoreMetal also now carries a real `isGemstone` flag (Settings' Stones
 * section — see schema.prisma), which product-form.tsx's
 * `classifyPurityFamily` and lib/purity.ts's `isCaratWeighedMetal` both
 * prefer over this name guess where it's cheap to plumb through. Deliberately
 * NOT threaded in here: `MetalFamily` has no generic "stone" bucket (only
 * DIAMOND), and most of this function's call sites (formatting an already-
 * persisted LedgerEntry/InvoiceItem/PurchaseItem row for display) only ever
 * see a bare metal-name *string* pulled off that historical record, not the
 * live StoreMetal row — there's no `isGemstone` to pass even if this
 * function accepted one. This is deliberately kept name-substring-only and
 * untouched by the dynamic-business-units work (2026-09-03): it classifies
 * an already-existing record for display, a different job from building a
 * *picker's* list of currently-selectable units (see
 * business-units.server.ts's getAvailableBusinessUnitOptions for that).
 * Widening this to a real stone bucket is a bigger, separate decision left
 * alone for now.
 */
export function classifyMetalName(name: string | null | undefined): MetalFamily {
  const lower = (name ?? "").toLowerCase()

  for (const [unit, matcher] of Object.entries(METAL_NAME_MATCHERS)) {
    if (lower.includes(matcher)) return unit as MetalFamily
  }

  return "OTHER"
}

/**
 * Formats a quantity for a resolved unit: rupees for the "MONEY" sentinel,
 * carats for a gemstone unit (StoreMetal.isGemstone), grams for any other
 * (plain metal) unit. Pass the resolved `{ value, isGemstone }` from
 * getActiveBusinessUnits()/getAvailableBusinessUnitOptions()
 * (business-units.server.ts) — this replaces the old fixed-enum version
 * that only knew about Gold/Silver (grams) and Diamond (carats), so a
 * custom metal or a non-Diamond gemstone (Ruby, Emerald, ...) now formats
 * correctly too.
 */
export function formatUnitValue(unit: UnitFormatHint, value: number) {
  const abs = Math.abs(value)

  if (unit !== MONEY_UNIT && unit.isGemstone) {
    return `${abs.toLocaleString("en-IN", { maximumFractionDigits: 3 })} ct`
  }

  if (unit !== MONEY_UNIT) {
    return `${abs.toLocaleString("en-IN", { maximumFractionDigits: 3 })} g`
  }

  return `₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}
