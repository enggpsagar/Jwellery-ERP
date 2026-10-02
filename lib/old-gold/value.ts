// Old Gold Exchange arithmetic shared by the invoice form (live preview)
// and the server (lib/old-gold/exchange.ts, which recomputes and is the
// real figure). Client-safe: no server-only imports.
//
// value = fine (24K / 999) weight × the fine rate × (1 − deduction% / 100),
// fine weight = net weight × the purity's fineness % (lib/fine-weight.ts).

import type { PieceComponentDraft } from "@/lib/piece-components"

export type OldGoldLineDraft = {
  key: string
  description: string
  metalTypeId: string
  purityLabel: string
  purity: string
  grossWeight: number
  netWeight: number
  deductionPercent: number
  /** Rate per gram of fine (24K / 999) metal. */
  rate: number
  /** Net Wt typed directly — stops it following Gross − stone weight. */
  netTouched: boolean
  /** "Does this piece have a stone?" — the stone's own weight comes off the
   * gross weight (net = gross − stone), and its value is added on top of
   * the metal's (and may be ₹0 when the shop doesn't pay for stones). */
  hasStone: boolean
  stoneMetalTypeName: string
  stoneTypeNames: string[]
  /** Stone weight in carats (what the rate is per). */
  caratWeight: number
  /** Physical stone weight, always grams internally. */
  stoneWeightGrams: number
  stoneWeightUnit: "GRAM" | "CARAT"
  netStoneWeightTouched: boolean
  /** Per carat. */
  stoneRate: number
  /** Stone value — stoneRate × caratWeight until typed directly. */
  stoneCharge: number
  stoneChargeTouched: boolean
  /** A piece of several metals/stones (lib/piece-components.ts): metals
   * valued on pure weight × pure rate (less deduction), stones added. */
  multiPart: boolean
  components: PieceComponentDraft[]
}

export const OLD_GOLD_EXCESS_MODES = ["STORE_CREDIT", "PAID_OUT"] as const
export type OldGoldExcessModeValue = (typeof OLD_GOLD_EXCESS_MODES)[number]

export function round2(value: number) {
  return Math.round(value * 100) / 100
}

export function round5(value: number) {
  return Math.round(value * 100000) / 100000
}

export function oldGoldFineWeight(netWeight: number, finenessPercent: number) {
  if (!(netWeight > 0)) return 0
  return round5((netWeight * finenessPercent) / 100)
}

export function oldGoldLineValue(fineWeight: number, rate: number, deductionPercent: number) {
  if (!(fineWeight > 0) || !(rate > 0)) return 0
  const deduction = Math.min(Math.max(deductionPercent || 0, 0), 100)
  return round2(fineWeight * rate * (1 - deduction / 100))
}

/** A line's full value: the metal's (24K-based) value plus its stone's. */
export function oldGoldLineTotal(metalValue: number, stoneValue: number) {
  return round2(metalValue + Math.max(stoneValue || 0, 0))
}

/** Metal net weight left once the stone's weight comes off the gross. */
export function netAfterStone(grossWeight: number, stoneWeightGrams: number) {
  if (!(grossWeight > 0)) return 0
  return round5(Math.max(0, grossWeight - Math.max(stoneWeightGrams || 0, 0)))
}

/**
 * How an exchange's value meets the bill: as much as the bill still needs
 * after cash/credit is applied, the rest is excess (store credit or payout).
 */
export function splitOldGoldValue(value: number, billRemaining: number) {
  const applied = round2(Math.min(Math.max(value, 0), Math.max(billRemaining, 0)))
  return { applied, excess: round2(Math.max(value, 0) - applied) }
}
