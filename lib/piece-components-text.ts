// Plain-text description of a piece made of several metals and stones, for
// places that can't render <PieceBreakdown> — emails and Excel/CSV exports.
// Client-safe (no Prisma import): numeric fields may be numbers, strings or
// Prisma.Decimal, so a caller can pass the stored rows straight through.
//
// e.g. "Gold 22K 4.000 g · ₹28,000.00 + Silver 925 2.000 g · ₹200.00 + Diamond 0.10 ct · ₹5,000.00"

import { stoneDetailsText } from "./piece-components"
import { DEFAULT_WEIGHT_FORMAT, type WeightFormat } from "./weight-calc"

export const METALS_AND_STONES_COLUMN = "Metals & Stones"

export type PieceComponentTextRow = {
  kind: string
  sortOrder?: number | null
  metalName?: string | null
  /** A Prisma include of `metalType: { select: { name: true } }`. */
  metalType?: { name: string } | null
  purityLabel?: string | null
  netWeight?: unknown
  stoneMetalTypeName?: string | null
  stoneTypeNames?: string | null
  caratWeight?: unknown
  pieces?: number | null
  clarity?: string | null
  certificateNumber?: string | null
  amount?: unknown
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function rupees(value: number) {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** One row, e.g. "Gold 22K 4.000 g · ₹28,000.00" or "Diamond 0.10 ct · ₹5,000.00". */
export function describePieceComponentText(row: PieceComponentTextRow, wf: WeightFormat = DEFAULT_WEIGHT_FORMAT) {
  const amount = num(row.amount)
  const value = amount != null && amount > 0 ? ` · ${rupees(amount)}` : ""
  if (row.kind === "METAL") {
    const name = [row.metalName ?? row.metalType?.name, row.purityLabel].filter(Boolean).join(" ") || "Metal"
    return `${name} ${wf.grams(num(row.netWeight) ?? 0)}${value}`
  }
  const name = [row.stoneMetalTypeName, row.stoneTypeNames].filter(Boolean).join(" ") || "Stone"
  const details = stoneDetailsText(row)
  return `${name} ${wf.stoneCarats(num(row.caratWeight) ?? 0)}${details ? ` · ${details}` : ""}${value}`
}

/**
 * The whole piece, rows joined with " + "; "" for a single-metal line (no
 * rows). Weights use `wf` — the store's decimals (getWeightFormat) — or 3.
 */
export function describePieceComponentsText(
  rows: PieceComponentTextRow[] | null | undefined,
  wf: WeightFormat = DEFAULT_WEIGHT_FORMAT,
) {
  if (!rows?.length) return ""
  return [...rows]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((row) => describePieceComponentText(row, wf))
    .join(" + ")
}
