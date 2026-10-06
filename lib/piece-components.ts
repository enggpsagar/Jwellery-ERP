// Pieces made of several metals and stones — e.g. one ornament of Gold 22K
// + Silver 925 + a Diamond — on a sale line, a purchase line, a Customer
// Exchange item and the stock row they create (PieceComponent in
// schema.prisma). Client-safe: shared by the editor (live preview), the
// server actions (which recompute — lib/piece-components.server.ts) and the
// reports (metalBreakdown).
//
// Value of a piece = Σ metal rows (weight × rate) + Σ stone rows (carats ×
// rate per carat, or a typed value). A metal is valued on its net weight on
// a sale or purchase, or on its pure (24K / 999) weight on a Customer
// Exchange ("fine" valuation). GST is per row, at the row's own rate; the
// line's making/HM charge is taxed at the line's rate.

export type PieceMetalDraft = {
  key: string
  kind: "METAL"
  metalTypeId: string
  purityLabel: string
  purity: string
  grossWeight: number
  netWeight: number
  /** Net typed directly — stops it following the gross weight. */
  netTouched: boolean
  /** Per gram (per gram of pure metal for "fine" valuation). */
  rate: number
  gstRateId: string
}

export type PieceStoneDraft = {
  key: string
  kind: "STONE"
  stoneMetalTypeName: string
  stoneTypeNames: string[]
  caratWeight: number
  /** Grams. Follows carats × grams-per-carat until typed. */
  stoneWeight: number
  stoneWeightTouched: boolean
  /** Per carat. */
  rate: number
  /** Stone value — carats × rate until typed. */
  amount: number
  amountTouched: boolean
  gstRateId: string
  /** Number of stones, clarity and certificate — shown on a picked stock
   * piece's row, read from its Product's matching stone row. Display only:
   * PieceComponent has no column for them. */
  pieces?: number | null
  clarity?: string | null
  certificateNumber?: string | null
}

export type PieceComponentDraft = PieceMetalDraft | PieceStoneDraft

export type PieceValuation = "net" | "fine"

/** What the server receives for each row (oldGold/items JSON). */
export type PieceComponentPayload = {
  kind: "METAL" | "STONE"
  metalTypeId?: string | null
  purityLabel?: string | null
  purity?: string | null
  grossWeight?: number | null
  netWeight?: number | null
  stoneMetalTypeName?: string | null
  stoneTypeNames?: string | null
  caratWeight?: number | null
  stoneWeight?: number | null
  rate?: number | null
  amount?: number | null
  gstRateId?: string | null
}

/** A stored row as the server hands it back (edit pages, linked stock). */
export type StoredPieceComponent = {
  kind: "METAL" | "STONE"
  metalTypeId: string | null
  purityLabel: string | null
  purity: string | null
  grossWeight: number | null
  netWeight: number | null
  fineWeight: number | null
  stoneMetalTypeName: string | null
  stoneTypeNames: string | null
  caratWeight: number | null
  stoneWeight: number | null
  rate: number | null
  amount: number
  gstRateId: string | null
  /** The stored row's id (quick per-row rate edit). */
  id?: string
  /** For display, when the query included the metal / GST snapshot. */
  metalName?: string | null
  gstRatePercent?: number | null
  /** Picker hints on a stock piece's rows (lib/inventory/stock-piece-rows.ts),
   * from the Product's matching row — never stored on a PieceComponent.
   * Stones: pieces / clarity / certificate and the Product's own stone rate.
   * Metals: the purity's configured selling price and fineness %. */
  pieces?: number | null
  clarity?: string | null
  certificateNumber?: string | null
  catalogRate?: number | null
  puritySellingPrice?: number | null
  purityFineness?: number | null
}

export function round2(value: number) {
  return Math.round(value * 100) / 100
}

export function round5(value: number) {
  return Math.round(value * 100000) / 100000
}

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function newMetalRow(rate = 0, gstRateId = ""): PieceMetalDraft {
  return {
    key: newKey(),
    kind: "METAL",
    metalTypeId: "",
    purityLabel: "",
    purity: "",
    grossWeight: 0,
    netWeight: 0,
    netTouched: false,
    rate,
    gstRateId,
  }
}

export function newStoneRow(gstRateId = ""): PieceStoneDraft {
  return {
    key: newKey(),
    kind: "STONE",
    stoneMetalTypeName: "",
    stoneTypeNames: [],
    caratWeight: 0,
    stoneWeight: 0,
    stoneWeightTouched: false,
    rate: 0,
    amount: 0,
    amountTouched: false,
    gstRateId,
  }
}

export type PieceValueOptions = {
  valuation: PieceValuation
  /** Fineness % of a metal row's purity (only used for "fine" valuation). */
  finenessOf?: (row: PieceMetalDraft) => number
}

/** Pure weight of a metal row (net × fineness), for display. */
export function metalRowFine(row: PieceMetalDraft, finenessOf?: (row: PieceMetalDraft) => number) {
  const fineness = finenessOf ? finenessOf(row) : 100
  return row.netWeight > 0 ? round5((row.netWeight * fineness) / 100) : 0
}

/** One row's value per piece, before GST. */
export function componentAmount(row: PieceComponentDraft, options: PieceValueOptions): number {
  if (row.kind === "STONE") {
    return row.amountTouched ? round2(Math.max(row.amount || 0, 0)) : round2((row.caratWeight || 0) * (row.rate || 0))
  }
  const weight = options.valuation === "fine" ? metalRowFine(row, options.finenessOf) : row.netWeight || 0
  return round2(Math.max(weight, 0) * Math.max(row.rate || 0, 0))
}

export function pieceTotals(rows: PieceComponentDraft[], options: PieceValueOptions) {
  let metalValue = 0
  let stoneValue = 0
  let metalNet = 0
  let metalGross = 0
  let stoneCarats = 0
  let stoneGrams = 0
  for (const row of rows) {
    const amount = componentAmount(row, options)
    if (row.kind === "METAL") {
      metalValue += amount
      metalNet += row.netWeight || 0
      metalGross += row.grossWeight || 0
    } else {
      stoneValue += amount
      stoneCarats += row.caratWeight || 0
      stoneGrams += row.stoneWeight || 0
    }
  }
  return {
    metalValue: round2(metalValue),
    stoneValue: round2(stoneValue),
    total: round2(metalValue + stoneValue),
    metalNet: round5(metalNet),
    metalGross: round5(metalGross),
    stoneCarats: round5(stoneCarats),
    stoneGrams: round5(stoneGrams),
  }
}

/**
 * GST on a piece's rows, each at its own rate — `rateOf` resolves a row's
 * gstRateId to a %, `split` turns a taxable value + % into the SGST/CGST/
 * IGST breakdown (computeGst with the document's scheme and states).
 * Multiplied by `quantity` (amounts are per piece).
 */
export function pieceGst(
  rows: PieceComponentDraft[],
  options: PieceValueOptions,
  quantity: number,
  rateOf: (gstRateId: string) => number,
  split: (taxable: number, ratePercent: number) => { sgst: number; cgst: number; igst: number },
) {
  let sgst = 0
  let cgst = 0
  let igst = 0
  for (const row of rows) {
    const taxable = componentAmount(row, options) * (quantity || 1)
    if (!(taxable > 0)) continue
    const part = split(taxable, rateOf(row.gstRateId))
    sgst += round2(part.sgst)
    cgst += round2(part.cgst)
    igst += round2(part.igst)
  }
  return { sgst: round2(sgst), cgst: round2(cgst), igst: round2(igst) }
}

export function toComponentPayload(rows: PieceComponentDraft[], options: PieceValueOptions): PieceComponentPayload[] {
  return rows.map((row) =>
    row.kind === "METAL"
      ? {
          kind: "METAL",
          metalTypeId: row.metalTypeId || null,
          purityLabel: row.purityLabel || null,
          purity: row.purity || null,
          grossWeight: row.grossWeight || null,
          netWeight: row.netWeight || null,
          rate: row.rate || null,
          amount: componentAmount(row, options),
          gstRateId: row.gstRateId || null,
        }
      : {
          kind: "STONE",
          stoneMetalTypeName: row.stoneMetalTypeName || null,
          stoneTypeNames: row.stoneTypeNames.length ? row.stoneTypeNames.join(", ") : null,
          caratWeight: row.caratWeight || null,
          stoneWeight: row.stoneWeight || null,
          rate: row.rate || null,
          amount: componentAmount(row, options),
          gstRateId: row.gstRateId || null,
        },
  )
}

/** Stored rows → editable drafts (edit pages; picking a multi-part stock piece). */
export function fromStoredComponents(rows: StoredPieceComponent[]): PieceComponentDraft[] {
  return rows.map((row) =>
    row.kind === "METAL"
      ? {
          key: newKey(),
          kind: "METAL",
          metalTypeId: row.metalTypeId ?? "",
          purityLabel: row.purityLabel ?? "",
          purity: row.purity ?? "",
          grossWeight: row.grossWeight ?? 0,
          netWeight: row.netWeight ?? 0,
          netTouched: true,
          rate: row.rate ?? 0,
          gstRateId: row.gstRateId ?? "",
        }
      : {
          key: newKey(),
          kind: "STONE",
          stoneMetalTypeName: row.stoneMetalTypeName ?? "",
          stoneTypeNames: row.stoneTypeNames ? row.stoneTypeNames.split(",").map((name) => name.trim()).filter(Boolean) : [],
          caratWeight: row.caratWeight ?? 0,
          stoneWeight: row.stoneWeight ?? 0,
          stoneWeightTouched: true,
          rate: row.rate ?? 0,
          amount: row.amount ?? 0,
          amountTouched: true,
          gstRateId: row.gstRateId ?? "",
          pieces: row.pieces ?? null,
          clarity: row.clarity ?? null,
          certificateNumber: row.certificateNumber ?? null,
        },
  )
}

/** Short human summary, e.g. "Gold 22K 8.200 g + Silver 925 3.000 g + Diamond 0.40 ct". */
export function describeComponents(
  rows: { kind: string; metalName?: string | null; purityLabel?: string | null; netWeight?: number | null; stoneMetalTypeName?: string | null; caratWeight?: number | null }[],
) {
  return rows
    .map((row) =>
      row.kind === "METAL"
        ? `${[row.metalName, row.purityLabel].filter(Boolean).join(" ")} ${(row.netWeight ?? 0).toFixed(3)} g`
        : `${row.stoneMetalTypeName ?? "Stone"} ${(row.caratWeight ?? 0).toFixed(2)} ct`,
    )
    .join(" + ")
}

/**
 * The metal-by-metal weights of a stored line or stock row: its
 * PieceComponent metal rows when it has them, else its own single metal.
 * Every report that totals metal by metal reads this, never the parent's
 * summary (which only carries the first metal's pure weight).
 */
export function metalBreakdown(row: {
  metalTypeId?: string | null
  netWeight?: unknown
  fineWeight?: unknown
  components?: { kind: string; metalTypeId?: string | null; netWeight?: unknown; fineWeight?: unknown }[] | null
}): { metalTypeId: string | null; netWeight: number; fineWeight: number }[] {
  const num = (value: unknown) => {
    const n = Number(value ?? 0)
    return Number.isFinite(n) ? n : 0
  }
  const metals = (row.components ?? []).filter((component) => component.kind === "METAL")
  if (metals.length) {
    return metals.map((component) => ({
      metalTypeId: component.metalTypeId ?? null,
      netWeight: num(component.netWeight),
      fineWeight: num(component.fineWeight ?? component.netWeight),
    }))
  }
  return [
    {
      metalTypeId: row.metalTypeId ?? null,
      netWeight: num(row.netWeight),
      fineWeight: num(row.fineWeight ?? row.netWeight),
    },
  ]
}

/** All metals' pure weight together (for totals that don't split by metal). */
export function totalFine(row: Parameters<typeof metalBreakdown>[0]) {
  return metalBreakdown(row).reduce((sum, part) => sum + part.fineWeight, 0)
}
