// Rate-wise GST summary for a printed invoice — one group per GST rate,
// split SGST+CGST (intra-state) or IGST (inter-state). Client-safe; shared
// by every A4 invoice print template.
//
// An ordinary line's whole tax sits at its own rate (derived from its tax ÷
// taxable value, as the templates always did). A piece of several metals/
// stones (lib/piece-components.ts) carries several rates: each metal/stone
// row's tax goes to that row's own rate, and what's left of the line's tax
// (making/HM, plus any rounding) to the line's own rate.
import { round2, type StoredPieceComponent } from "@/lib/piece-components"

export type GstSummaryItem = {
  quantity: number
  lineTotal: number
  sgstAmount: number
  cgstAmount: number
  igstAmount: number
  gstRatePercent?: number | null
  components?: StoredPieceComponent[] | null
}

export type GstRateGroup = { percent: number; sgst: number; cgst: number; igst: number }

/** An ordinary line's GST % — its tax over its taxable value. */
export function derivedLinePercent(item: GstSummaryItem) {
  const amount = item.sgstAmount + item.cgstAmount + item.igstAmount
  const taxable = item.lineTotal - amount
  return taxable > 0 ? Math.round((amount / taxable) * 10000) / 100 : 0
}

/** True when the line's tax spans several rates (a multi-part piece). */
export function hasMixedGst(item: GstSummaryItem) {
  return Boolean(item.components?.some((row) => (row.gstRatePercent ?? 0) > 0))
}

export function gstRateGroups(items: GstSummaryItem[]): GstRateGroup[] {
  const groups = new Map<number, GstRateGroup>()
  const add = (percent: number, sgst: number, cgst: number, igst: number) => {
    if (!(percent > 0) || !(sgst + cgst + igst > 0)) return
    const group = groups.get(percent) ?? { percent, sgst: 0, cgst: 0, igst: 0 }
    group.sgst = round2(group.sgst + sgst)
    group.cgst = round2(group.cgst + cgst)
    group.igst = round2(group.igst + igst)
    groups.set(percent, group)
  }

  for (const item of items) {
    if (!hasMixedGst(item)) {
      add(derivedLinePercent(item), item.sgstAmount, item.cgstAmount, item.igstAmount)
      continue
    }
    const interState = item.igstAmount > 0
    let sgst = item.sgstAmount
    let cgst = item.cgstAmount
    let igst = item.igstAmount
    for (const row of item.components ?? []) {
      const percent = row.gstRatePercent ?? 0
      if (!(percent > 0)) continue
      const tax = round2((row.amount * (item.quantity || 1) * percent) / 100)
      if (interState) {
        add(percent, 0, 0, tax)
        igst -= tax
      } else {
        const half = round2(tax / 2)
        add(percent, half, round2(tax - half), 0)
        sgst -= half
        cgst -= round2(tax - half)
      }
    }
    // Making/HM (and rounding) at the line's own rate.
    add(item.gstRatePercent ?? derivedLinePercent(item), round2(Math.max(sgst, 0)), round2(Math.max(cgst, 0)), round2(Math.max(igst, 0)))
  }

  return Array.from(groups.values()).sort((a, b) => a.percent - b.percent)
}
