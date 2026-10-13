// Sold-by-weight lots (Product.soldByWeight) — pure, client-safe helpers.
//
// A lot is one InventoryStock row (quantity 1) whose weights are the whole
// lot: a parcel of loose stones, a bar, raw metal. A sale takes part of it by
// its "measure" — net weight for metal, carats for a stone parcel with no
// gram weight — and every other weight comes off in the same proportion.
// The exact weights a line took are stored on the line (`lotDraw`), so every
// restore path gives back exactly that (lib/inventory/weight-lot.server.ts).
//
// Only single-part rows: a row with PieceComponent rows (multi-part piece)
// always sells whole. A sold-by-weight product's old rows with quantity > 1
// (stocked before the flag existed) also keep selling by the piece.

export type LotWeights = {
  grossWeight: number
  netWeight: number
  fineWeight: number
  caratWeight: number
  stoneWeight: number
}

export type LotMeasure = "netWeight" | "caratWeight" | "grossWeight"

/** What a sale line took off a lot — stored as InvoiceItem/KachaInvoiceItem.lotDraw. */
export type LotDraw = LotWeights & { measure: LotMeasure }

export const LOT_WEIGHT_FIELDS: (keyof LotWeights)[] = [
  "grossWeight",
  "netWeight",
  "fineWeight",
  "caratWeight",
  "stoneWeight",
]

/** Stored precision of each column (Decimal(12,5) grams, Decimal(10,3) carats). */
export function lotFieldDecimals(field: keyof LotWeights): number {
  return field === "caratWeight" ? 3 : 5
}

/** Below this, a remaining measure counts as empty (float noise only). */
export const LOT_EPSILON = 1e-9

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function num(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0
  const n = Number(typeof value === "object" ? String(value) : value)
  return Number.isFinite(n) ? n : 0
}

/** Any row with these columns (Decimal, string or number) → plain numbers. */
export function toLotWeights(row: {
  grossWeight?: unknown
  netWeight?: unknown
  fineWeight?: unknown
  caratWeight?: unknown
  stoneWeight?: unknown
}): LotWeights {
  return {
    grossWeight: num(row.grossWeight),
    netWeight: num(row.netWeight),
    fineWeight: num(row.fineWeight),
    caratWeight: num(row.caratWeight),
    stoneWeight: num(row.stoneWeight),
  }
}

/** Net weight for a metal lot, carats for a stone parcel, else gross. */
export function lotMeasure(lot: LotWeights): LotMeasure | null {
  if (lot.netWeight > LOT_EPSILON) return "netWeight"
  if (lot.caratWeight > LOT_EPSILON) return "caratWeight"
  if (lot.grossWeight > LOT_EPSILON) return "grossWeight"
  return null
}

export function lotMeasureUnit(measure: LotMeasure): "g" | "ct" {
  return measure === "caratWeight" ? "ct" : "g"
}

/**
 * Whether a stock row sells by weight: its product is flagged, it holds at
 * most one lot and it isn't a multi-part piece.
 */
export function isWeightLotRow(row: { soldByWeight: boolean; quantity: number; componentCount: number }) {
  return row.soldByWeight && row.quantity <= 1 && row.componentCount === 0
}

/**
 * isWeightLotRow for a loaded stock row: a piece whose Product has more than
 * one metal or stone opens multi-part on a sale (stock-piece-rows.ts), so it
 * counts as multi-part here too.
 */
export function stockSellsByWeight(stock: {
  quantity: number
  components: readonly unknown[] | number
  product: { soldByWeight: boolean; metalComponents: readonly unknown[] | number; stoneComponents: readonly unknown[] | number }
}) {
  const count = (value: readonly unknown[] | number) => (typeof value === "number" ? value : value.length)
  const productMultiPart = count(stock.product.metalComponents) > 1 || count(stock.product.stoneComponents) > 1
  return isWeightLotRow({
    soldByWeight: stock.product.soldByWeight,
    quantity: stock.quantity,
    componentCount: count(stock.components) + (productMultiPart ? 1 : 0),
  })
}

export type LotDrawPlan =
  | { ok: true; draw: LotDraw; whole: boolean }
  | { ok: false; error: string }

/**
 * How much of `lot` a sale of `requested` (in the lot's measure) takes.
 * 0 < requested ≤ remaining; requesting everything that's left takes every
 * weight exactly (no rounding dust left behind), anything less takes each
 * weight in proportion, rounded to its column's precision.
 */
export function planLotDraw(lot: LotWeights, requested: number | null | undefined, label = "this lot"): LotDrawPlan {
  const measure = lotMeasure(lot)
  if (!measure) return { ok: false, error: `Nothing is left of ${label}.` }
  const remaining = lot[measure]
  const unit = lotMeasureUnit(measure)
  const asked = roundTo(num(requested), lotFieldDecimals(measure))
  if (!(asked > 0)) {
    return { ok: false, error: `Enter how much of ${label} is sold (more than 0 ${unit}).` }
  }
  if (asked > remaining + LOT_EPSILON) {
    return { ok: false, error: `Only ${remaining} ${unit} is left of ${label}, but ${asked} ${unit} was billed.` }
  }
  if (Math.abs(asked - remaining) <= LOT_EPSILON) {
    return { ok: true, whole: true, draw: { ...lot, measure } }
  }
  const fraction = asked / remaining
  const draw = { measure } as LotDraw
  for (const field of LOT_WEIGHT_FIELDS) {
    draw[field] =
      field === measure
        ? asked
        : Math.min(lot[field], Math.max(0, roundTo(lot[field] * fraction, lotFieldDecimals(field))))
  }
  return { ok: true, whole: false, draw }
}

export function addLotWeights(a: LotWeights, b: LotWeights): LotWeights {
  const out = {} as LotWeights
  for (const field of LOT_WEIGHT_FIELDS) out[field] = roundTo(a[field] + b[field], lotFieldDecimals(field))
  return out
}

export function subtractLotWeights(a: LotWeights, b: LotWeights): LotWeights {
  const out = {} as LotWeights
  for (const field of LOT_WEIGHT_FIELDS) {
    out[field] = Math.max(0, roundTo(a[field] - b[field], lotFieldDecimals(field)))
  }
  return out
}

/** A stored `lotDraw` JSON value → LotDraw, or null for a by-quantity line. */
export function parseLotDraw(value: unknown): LotDraw | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const measure = raw.measure
  if (measure !== "netWeight" && measure !== "caratWeight" && measure !== "grossWeight") return null
  return { ...toLotWeights(raw), measure }
}

/** For a Prisma Json column. */
export function lotDrawJson(draw: LotDraw | null | undefined) {
  if (!draw) return undefined
  return {
    measure: draw.measure,
    grossWeight: draw.grossWeight,
    netWeight: draw.netWeight,
    fineWeight: draw.fineWeight,
    caratWeight: draw.caratWeight,
    stoneWeight: draw.stoneWeight,
  }
}

/** Proportional gross for a form preview while the measure is typed. */
export function previewLotDraw(lot: LotWeights, requested: number): LotWeights | null {
  const plan = planLotDraw(lot, requested)
  return plan.ok ? plan.draw : null
}
