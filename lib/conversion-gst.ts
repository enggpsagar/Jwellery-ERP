// GST of a Kacha slip or Quotation being converted to a Tax Invoice — one
// function for the server (convertKachaToPakka / convertQuotationToInvoice)
// and the convert screens' previews, so what's previewed is what's saved.
// Client-safe.
//
// Same base as New Invoice (invoice-form.tsx's taxableValue): per line,
// metal value (rate × weight × quantity) + making + HM + stone charge; the
// document-level discount is not taken off the tax base (as on a direct
// invoice), but a line's offer share (promoDiscount) is — it becomes the
// invoice line's pre-GST schemeDiscount; on a piece of several rows every
// part is scaled by the same factor (as invoice-form.tsx does). A piece of several metals/stones taxes each row (amount ×
// quantity) at the row's own GST rate (fallback: the picked rate), making/HM
// at the picked rate.
import { computeGst } from "@/lib/gst"
import type { GstScheme } from "@prisma/client"

export type ConversionGstItem = {
  rate: number | null
  purity: string | null
  netWeight: number | null
  caratWeight: number | null
  quantity: number
  makingCharge: number
  hmCharge: number
  stoneCharge: number
  /** This line's share of an offer, taken off before GST. */
  promoDiscount?: number
  components?: { amount: number; gstRatePercent?: number | null }[] | null
}

export type ConversionGstGroup = { ratePercent: number; sgst: number; cgst: number; igst: number }

const round2 = (value: number) => Math.round(value * 100) / 100

export function conversionGst(
  items: ConversionGstItem[],
  pickedRate: number,
  scheme: GstScheme | string,
  storeState: string | null | undefined,
  customerState: string | null | undefined,
) {
  const groups = new Map<number, ConversionGstGroup>()
  const tax = (taxable: number, ratePercent: number) => {
    const gst = computeGst(taxable, ratePercent, scheme as GstScheme, storeState, customerState)
    const part = { sgst: round2(gst.sgst), cgst: round2(gst.cgst), igst: round2(gst.igst) }
    if (part.sgst + part.cgst + part.igst > 0) {
      const group = groups.get(ratePercent) ?? { ratePercent, sgst: 0, cgst: 0, igst: 0 }
      group.sgst = round2(group.sgst + part.sgst)
      group.cgst = round2(group.cgst + part.cgst)
      group.igst = round2(group.igst + part.igst)
      groups.set(ratePercent, group)
    }
    return part
  }

  const perItem = items.map((item) => {
    const quantity = item.quantity || 1
    const components = item.components ?? []
    const promo = Math.max(0, item.promoDiscount ?? 0)
    if (!components.length) {
      const weight = (item.purity === "DIAMOND" ? item.caratWeight : item.netWeight) ?? 0
      const base = (item.rate ?? 0) * weight * quantity + item.makingCharge + item.hmCharge + item.stoneCharge
      return tax(Math.max(0, base - promo), pickedRate)
    }
    const sum = { sgst: 0, cgst: 0, igst: 0 }
    const rawParts = [
      ...components.map((row) => ({ taxable: row.amount * quantity, rate: row.gstRatePercent ?? pickedRate })),
      { taxable: item.makingCharge + item.hmCharge, rate: pickedRate },
    ]
    const base = rawParts.reduce((acc, part) => acc + Math.max(0, part.taxable), 0)
    const factor = promo > 0 && base > 0 ? Math.max(0, (base - promo) / base) : 1
    const parts = rawParts.map((part) => ({ ...part, taxable: part.taxable * factor }))
    for (const part of parts) {
      if (!(part.taxable > 0)) continue
      const gst = tax(part.taxable, part.rate)
      sum.sgst += gst.sgst
      sum.cgst += gst.cgst
      sum.igst += gst.igst
    }
    return { sgst: round2(sum.sgst), cgst: round2(sum.cgst), igst: round2(sum.igst) }
  })

  return {
    perItem,
    taxAmount: round2(perItem.reduce((acc, part) => acc + part.sgst + part.cgst + part.igst, 0)),
    groups: Array.from(groups.values()).sort((a, b) => a.ratePercent - b.ratePercent),
  }
}

/** Decimal-holding rows (server) → plain numbers for conversionGst. */
export function toConversionGstItem(item: {
  rate: unknown
  purity: string | null
  netWeight: unknown
  caratWeight: unknown
  quantity: number
  makingCharge: unknown
  hmCharge: unknown
  stoneCharge: unknown
  promoDiscount?: unknown
  components?: { amount: unknown; gstRatePercent?: unknown }[] | null
}): ConversionGstItem {
  const n = (value: unknown) => (value == null ? null : Number(value))
  return {
    rate: n(item.rate),
    purity: item.purity,
    netWeight: n(item.netWeight),
    caratWeight: n(item.caratWeight),
    quantity: item.quantity,
    makingCharge: Number(item.makingCharge ?? 0),
    hmCharge: Number(item.hmCharge ?? 0),
    stoneCharge: Number(item.stoneCharge ?? 0),
    promoDiscount: Number(item.promoDiscount ?? 0),
    components: (item.components ?? []).map((row) => ({
      amount: Number(row.amount ?? 0),
      gstRatePercent: row.gstRatePercent == null ? null : Number(row.gstRatePercent),
    })),
  }
}
