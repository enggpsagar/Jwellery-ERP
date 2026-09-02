// lib/business-units.ts
//
// Pure constants/helpers only — no server-only imports (next/headers, prisma)
// — so this can be imported from client components too (e.g. ledger-view.tsx
// uses classifyMetalName to decide how to render a row). Server-side lookups
// live in lib/business-units.server.ts.
import { BusinessUnit } from "@prisma/client"

export type { BusinessUnit }

export const ALL_BUSINESS_UNITS: BusinessUnit[] = [
  "MONEY",
  "GOLD",
  "SILVER",
  "DIAMOND",
]

export const BUSINESS_UNIT_LABELS: Record<BusinessUnit, string> = {
  MONEY: "Money",
  GOLD: "Gold",
  SILVER: "Silver",
  DIAMOND: "Diamond",
}

export const BUSINESS_UNIT_DESCRIPTIONS: Record<BusinessUnit, string> = {
  MONEY: "Track customer/karigar dues and payments in rupees.",
  GOLD: "Track dues and payments in grams of fine gold.",
  SILVER: "Track dues and payments in grams of silver.",
  DIAMOND: "Track dues and payments in carats of diamond weight.",
}

/** Non-money units that are settled by weight rather than by a rupee amount. */
export const WEIGHT_BASED_UNITS: BusinessUnit[] = ["GOLD", "SILVER"]

/**
 * Non-money units settled by carat weight rather than a rupee amount.
 * Diamond used to be tracked as a rupee-equivalent value (see git history),
 * but a real Diamond Ledger needs an actual carat quantity — kept as its own
 * list rather than folded into WEIGHT_BASED_UNITS since the unit (carats,
 * not grams) and precision differ from Gold/Silver.
 */
export const CARAT_BASED_UNITS: BusinessUnit[] = ["DIAMOND"]

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
 */
export function classifyMetalName(name: string | null | undefined): MetalFamily {
  const lower = (name ?? "").toLowerCase()

  for (const [unit, matcher] of Object.entries(METAL_NAME_MATCHERS)) {
    if (lower.includes(matcher)) return unit as MetalFamily
  }

  return "OTHER"
}

export function formatUnitValue(unit: BusinessUnit, value: number) {
  const abs = Math.abs(value)

  if (WEIGHT_BASED_UNITS.includes(unit)) {
    return `${abs.toLocaleString("en-IN", { maximumFractionDigits: 3 })} g`
  }

  if (CARAT_BASED_UNITS.includes(unit)) {
    return `${abs.toLocaleString("en-IN", { maximumFractionDigits: 3 })} ct`
  }

  return `₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}
