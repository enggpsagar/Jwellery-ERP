// Old Gold Exchange arithmetic shared by the invoice form (live preview)
// and the server (lib/old-gold/exchange.ts, which recomputes and is the
// real figure). Client-safe: no server-only imports.
//
// value = fine (24K / 999) weight × the fine rate × (1 − deduction% / 100),
// fine weight = net weight × the purity's fineness % (lib/fine-weight.ts).

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

/**
 * How an exchange's value meets the bill: as much as the bill still needs
 * after cash/credit is applied, the rest is excess (store credit or payout).
 */
export function splitOldGoldValue(value: number, billRemaining: number) {
  const applied = round2(Math.min(Math.max(value, 0), Math.max(billRemaining, 0)))
  return { applied, excess: round2(Math.max(value, 0) - applied) }
}
