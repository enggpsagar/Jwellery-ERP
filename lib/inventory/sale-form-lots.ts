// Sold-by-weight lots on the sale forms (Invoice, Estimate, Quotation) —
// pure, client-safe. One copy for all three forms, so the lot maths can't
// drift between them. The server side is lib/inventory/weight-lot.server.ts.

import { LOT_EPSILON, lotMeasure, previewLotDraw, toLotWeights, type LotMeasure, type LotWeights } from "@/lib/inventory/weight-lot"

export type SaleFormLot = { weights: LotWeights; measure: LotMeasure; label: string }

type LotStockOption = Parameters<typeof toLotWeights>[0] & {
  sellsByWeight?: boolean
  components?: readonly unknown[] | null
  productName: string
}

type LotLine = {
  key: string
  inventoryStockId: string
  multiPart?: boolean
  grossWeight: number
  netWeight: number
  caratWeight: number
}

type LotPatchLine = { stoneRate: number; stoneChargeTouched: boolean; caratWeight: number }

export type LotLinePatch = {
  grossWeight?: number
  netWeight?: number
  caratWeight?: number
  stoneWeightInput?: number
  quantity: number
  stoneCharge?: number
}

/**
 * The lot a picked stock option sells as, or null when it sells by the
 * piece. Always the option's own weights (never a line's, which are the
 * already-reduced draw), so the proportional maths runs from the whole lot.
 */
export function lotOfStock(stock: LotStockOption | undefined): SaleFormLot | null {
  if (!stock?.sellsByWeight || stock.components?.length) return null
  const weights = toLotWeights(stock)
  const measure = lotMeasure(weights)
  return measure ? { weights, measure, label: stock.productName } : null
}

/** What's left of a lot for one line: the lot less every other line on it. */
export function lotLeftFor(
  lines: readonly LotLine[],
  stockId: string,
  lot: Pick<SaleFormLot, "weights" | "measure">,
  excludeKey: string,
): number {
  return (
    lot.weights[lot.measure] -
    lines
      .filter((line) => line.key !== excludeKey && line.inventoryStockId === stockId && !line.multiPart)
      .reduce((sum, line) => sum + (line[lot.measure] || 0), 0)
  )
}

/**
 * A line's weights for `amount` of the lot (in its measure): every weight in
 * proportion, so metal value, stone charge, % making and GST all re-derive
 * from the existing line fields.
 */
export function lotLinePatch(
  item: LotPatchLine,
  lot: Pick<SaleFormLot, "weights" | "measure">,
  amount: number,
): LotLinePatch {
  const draw = previewLotDraw(lot.weights, amount)
  const patch: LotLinePatch = draw
    ? {
        grossWeight: draw.grossWeight,
        netWeight: draw.netWeight,
        caratWeight: draw.caratWeight,
        stoneWeightInput: draw.stoneWeight,
        quantity: 1,
      }
    : { [lot.measure]: amount, quantity: 1 }
  const carats = patch.caratWeight ?? item.caratWeight
  if (!item.stoneChargeTouched && item.stoneRate > 0) {
    patch.stoneCharge = Number((item.stoneRate * carats).toFixed(2))
  }
  return patch
}

/** How each form names what's on it: "sold" on the bill, "quoted" on the quotation. */
export type LotDocument = { verb: "sold" | "quoted"; noun: "bill" | "estimate" | "quotation" }

/**
 * A lot line's problem, if any: nothing on it, or the lines on this lot
 * together asking for more than is left.
 */
export function lotProblem(
  lines: readonly LotLine[],
  item: LotLine,
  lot: SaleFormLot | null,
  doc: LotDocument,
  formatWeight: (measure: LotMeasure, value: number) => string,
): string | null {
  if (!lot) return null
  const amount = item[lot.measure] || 0
  if (!(amount > LOT_EPSILON)) return `Enter how much of ${lot.label} is ${doc.verb}.`
  const onDocument = lot.weights[lot.measure] - lotLeftFor(lines, item.inventoryStockId, lot, "")
  if (onDocument > lot.weights[lot.measure] + LOT_EPSILON) {
    return `Only ${formatWeight(lot.measure, lot.weights[lot.measure])} of ${lot.label} is left, but ${formatWeight(lot.measure, onDocument)} is on this ${doc.noun}.`
  }
  return null
}

/** "of 70 g left — sold by weight" under a lot line's weight field. */
export function lotHint(
  lines: readonly LotLine[],
  item: LotLine,
  lot: Pick<SaleFormLot, "weights" | "measure">,
  formatWeight: (measure: LotMeasure, value: number) => string,
): string {
  return `of ${formatWeight(lot.measure, Math.max(0, lotLeftFor(lines, item.inventoryStockId, lot, item.key)))} left — sold by weight`
}
