// Today's selling rates for a picked stock piece's metals and stones —
// client-safe, shared by the Invoice, Kacha and Quotation forms so the
// same piece opens with the same rates everywhere.
//
// Stone (per carat): the piece's / Product's own stone rate, else the Stone
// Type's Selling Price (Settings > Taxonomy > Stones > Types), else the
// stone's own Selling Price. Metal (per gram): the purity's Selling Price,
// else the metal's, else today's fine rate (Metal Rates board) × the
// purity's fineness, else the row's stored rate.

import { classifyMetalName } from "@/lib/business-units"
import {
  fromStoredComponents,
  round2,
  type PieceComponentDraft,
  type StoredPieceComponent,
} from "@/lib/piece-components"

type MetalLike = { id: string; name: string; sellingPrice?: number | null }
type OriginLike = { storeMetalId: string; name: string; sellingPrice: number | null }
export type FineRates = { gold: number | null; silver: number | null }

/** The stone details a single-stone line shows for a picked piece (from
 * its Product's matching stone row — lib/inventory/stock-piece-rows.ts). */
export type LinkedStoneDetails = {
  pieces: number | null
  clarity: string | null
  certificateNumber: string | null
  /** The Product's own stone rate (per carat). */
  catalogRate: number | null
}

const positive = (value: number | null | undefined): value is number => value != null && value > 0

function splitTypes(types: string | string[] | null | undefined) {
  if (!types) return []
  return (Array.isArray(types) ? types : types.split(",")).map((name) => name.trim()).filter(Boolean)
}

/** Rate per carat for a stone on a picked piece (0 = nothing configured). */
export function stoneSellingRate(
  stone: { name: string | null | undefined; types: string | string[] | null | undefined; ownRate?: number | null },
  metals: MetalLike[],
  origins: OriginLike[],
): number {
  if (positive(stone.ownRate)) return stone.ownRate
  const name = (stone.name ?? "").trim().toLowerCase()
  if (!name) return 0
  const metal = metals.find((row) => row.name.toLowerCase() === name)
  if (!metal) return 0
  for (const type of splitTypes(stone.types)) {
    const origin = origins.find(
      (row) => row.storeMetalId === metal.id && row.name.toLowerCase() === type.toLowerCase(),
    )
    if (origin && positive(origin.sellingPrice)) return origin.sellingPrice
  }
  return positive(metal.sellingPrice) ? metal.sellingPrice : 0
}

/** Rate per gram for a metal row on a picked piece. */
export function metalRowSellingRate(row: StoredPieceComponent, metals: MetalLike[], fineRates?: FineRates): number {
  if (positive(row.puritySellingPrice)) return row.puritySellingPrice
  const metal = metals.find((m) => m.id === row.metalTypeId)
  if (metal && positive(metal.sellingPrice)) return metal.sellingPrice
  if (fineRates && row.purityFineness != null) {
    const family = classifyMetalName(metal?.name)
    const fine = family === "GOLD" ? fineRates.gold : family === "SILVER" ? fineRates.silver : null
    if (positive(fine)) return round2((fine * row.purityFineness) / 100)
  }
  return row.rate ?? 0
}

/** A picked piece's rows as editable drafts, priced at today's rates —
 * every stone's value follows carats × rate until typed. */
export function stockPieceDrafts(
  rows: StoredPieceComponent[],
  options: { metals: MetalLike[]; origins: OriginLike[]; fineRates?: FineRates },
): PieceComponentDraft[] {
  return fromStoredComponents(rows).map((draft, index) => {
    const row = rows[index]
    if (draft.kind === "METAL") return { ...draft, rate: metalRowSellingRate(row, options.metals, options.fineRates) }
    const rate =
      stoneSellingRate(
        { name: row.stoneMetalTypeName, types: row.stoneTypeNames, ownRate: row.catalogRate },
        options.metals,
        options.origins,
      ) || draft.rate
    return { ...draft, rate, amount: round2((draft.caratWeight || 0) * rate), amountTouched: false }
  })
}
