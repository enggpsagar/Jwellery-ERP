"use server"

import { PieceComponentKind } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { getStoreIdForRead } from "@/lib/store-context"
import type { WeightFormat } from "@/lib/weight-calc"
import { getWeightFormat } from "@/lib/weight-settings.server"
import { resolveStoreName } from "@/lib/invite-email"
import { formatShortDate } from "@/lib/utils"
import { tagPurity } from "@/components/inventory/stock/stock-qr-label"
import {
  DEFAULT_BARCODE_TAG_FIELDS,
  DEFAULT_QR_TAG_FIELDS,
  normalizeTagFields,
  type StockTagField,
} from "@/lib/stock-tag-fields"

export type StockTagMetal = {
  name: string
  /** "18 KT", "925" — null for a metal with no purity. */
  purity: string | null
  /** Net weight of this metal, "1.794g". */
  weight: string | null
}

export type StockTagStone = {
  name: string
  /** Stone Types, e.g. "Natural". */
  types: string | null
  carat: string | null
  pieces: number | null
  clarity: string | null
  certificate: string | null
}

/** Everything a printed tag can show — StockQrLabel and StockBarcodeLabel
 * pick from it per Settings > Tags. */
export type StockTagData = {
  id: string
  storeName: string
  /** Encoded in the barcode and printed as the tag code: the tag number, else the stock code. */
  code: string
  stockCode: string
  tagNumber: string | null
  productName: string
  productCode: string | null
  category: string | null
  /** Every metal in the piece — one row for a single-metal piece, one per
   * metal row for a multi-part piece (gold + silver). */
  metals: StockTagMetal[]
  /** First metal's purity, the way it's written on a tag ("18 KT"). */
  karat: string | null
  grossWeight: string | null
  netWeight: string | null
  stones: StockTagStone[]
  stoneTotalCarat: string | null
  stoneTotalPieces: number | null
  manufactureDate: string | null
}

export type StockTagSettings = { qr: StockTagField[]; barcode: StockTagField[] }

/** "18K" / "18" → "18 KT" for a gold-style label; anything else as-is. */
function karatLabel(purity: string | null) {
  if (!purity) return null
  const match = /^(\d+)\s*(K|KT)?$/i.exec(purity.trim())
  if (!match) return purity
  // A bare 3-digit label is a silver/platinum fineness (925, 999), not karat.
  return match[2] || Number(match[1]) <= 24 ? `${match[1]} KT` : match[1]
}

// Settings > Weights decimals (grams; a stone's carats at most 2, as always).
function grams(value: unknown, wf: WeightFormat) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  return number > 0 ? `${wf.g(number)}g` : null
}

function carats(value: unknown, wf: WeightFormat) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  return number > 0 ? `${wf.stoneCt(number)}ct` : null
}

/** Settings > Tags — which fields each layout prints. A store with no
 * BusinessSettings row yet prints the defaults. */
export async function getStockTagSettings(): Promise<StockTagSettings> {
  const storeId = await getStoreIdForRead()
  const settings = await prisma.businessSettings.findUnique({
    where: { storeId },
    select: { qrTagFields: true, barcodeTagFields: true },
  })
  return {
    qr: normalizeTagFields(settings?.qrTagFields, DEFAULT_QR_TAG_FIELDS),
    barcode: normalizeTagFields(settings?.barcodeTagFields, DEFAULT_BARCODE_TAG_FIELDS),
  }
}

/**
 * Tag data for the given stock items, scoped to the current store.
 * Metals: the piece's own metal rows (multi-part), else its single metal.
 * Stones: the piece's own stone rows, else its single stone fields, else the
 * Product's stone rows. Pieces, clarity and certificate come from the
 * Product's matching stone row — stock rows don't record them.
 */
export async function getStockTags(ids: string[]): Promise<StockTagData[]> {
  if (ids.length === 0) return []
  const storeId = await getStoreIdForRead()
  const wf = await getWeightFormat(storeId)

  const [storeName, rows] = await Promise.all([
    resolveStoreName(storeId),
    prisma.inventoryStock.findMany({
      where: { id: { in: ids }, storeId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        stockCode: true,
        tagNumber: true,
        purity: true,
        purityLabel: true,
        grossWeight: true,
        netWeight: true,
        stoneMetalTypeName: true,
        stoneTypeNames: true,
        caratWeight: true,
        manufactureDate: true,
        metalType: { select: { name: true } },
        components: {
          orderBy: { sortOrder: "asc" },
          select: {
            kind: true,
            metalType: { select: { name: true } },
            purity: true,
            purityLabel: true,
            netWeight: true,
            grossWeight: true,
            stoneMetalTypeName: true,
            stoneTypeNames: true,
            caratWeight: true,
          },
        },
        product: {
          select: {
            name: true,
            productCode: true,
            category: { select: { name: true } },
            categoryType: { select: { name: true } },
            stoneComponents: {
              orderBy: { sortOrder: "asc" },
              select: {
                stoneMetalTypeName: true,
                stoneTypeNames: true,
                caratWeight: true,
                pieces: true,
                clarity: true,
                certificateNumber: true,
              },
            },
          },
        },
      },
    }),
  ])

  return rows.map((stock) => {
    const productStones = stock.product?.stoneComponents ?? []

    // Details for the nth stock stone named X = the product's nth row named X.
    const seen = new Map<string, number>()
    const productStoneFor = (name: string) => {
      const nth = seen.get(name) ?? 0
      seen.set(name, nth + 1)
      return productStones.filter((row) => row.stoneMetalTypeName === name)[nth]
    }
    const stoneLine = (name: string, types: string | null, carat: unknown): StockTagStone => {
      const match = productStoneFor(name)
      return {
        name,
        types: types || match?.stoneTypeNames || null,
        carat: carats(carat ?? match?.caratWeight, wf),
        pieces: match?.pieces ?? null,
        clarity: match?.clarity ?? null,
        certificate: match?.certificateNumber ?? null,
      }
    }

    const metalRows = stock.components.filter((row) => row.kind === PieceComponentKind.METAL)
    let metals: StockTagMetal[] = metalRows.map((row) => ({
      name: row.metalType?.name ?? "Metal",
      purity: karatLabel(tagPurity(row.purityLabel, row.purity)),
      weight: grams(row.netWeight ?? row.grossWeight, wf),
    }))
    if (metals.length === 0 && stock.metalType) {
      metals = [
        {
          name: stock.metalType.name,
          purity: karatLabel(tagPurity(stock.purityLabel, stock.purity)),
          weight: grams(stock.netWeight, wf),
        },
      ]
    }

    let stones: StockTagStone[] = stock.components
      .filter((row) => row.kind === PieceComponentKind.STONE && row.stoneMetalTypeName)
      .map((row) => stoneLine(row.stoneMetalTypeName!, row.stoneTypeNames, row.caratWeight))

    if (stones.length === 0 && stock.stoneMetalTypeName) {
      stones = [stoneLine(stock.stoneMetalTypeName, stock.stoneTypeNames, stock.caratWeight)]
    }

    if (stones.length === 0) {
      stones = productStones.map((row) => ({
        name: row.stoneMetalTypeName,
        types: row.stoneTypeNames,
        carat: carats(row.caratWeight, wf),
        pieces: row.pieces,
        clarity: row.clarity,
        certificate: row.certificateNumber,
      }))
    }

    const totalCarat = stones.reduce((sum, stone) => sum + (stone.carat ? parseFloat(stone.carat) : 0), 0)
    const totalPieces = stones.reduce((sum, stone) => sum + (stone.pieces ?? 0), 0)
    const category = [stock.product?.category?.name, stock.product?.categoryType?.name].filter(Boolean).join(" · ")

    return {
      id: stock.id,
      storeName,
      code: stock.tagNumber || stock.stockCode,
      stockCode: stock.stockCode,
      tagNumber: stock.tagNumber || null,
      productName: stock.product?.name ?? "-",
      productCode: stock.product?.productCode ?? null,
      category: category || null,
      metals,
      karat: metals[0]?.purity ?? null,
      grossWeight: grams(stock.grossWeight, wf),
      netWeight: grams(stock.netWeight, wf),
      stones,
      stoneTotalCarat: totalCarat > 0 ? `${wf.stoneCt(totalCarat)}ct` : null,
      stoneTotalPieces: totalPieces > 0 ? totalPieces : null,
      manufactureDate: stock.manufactureDate ? formatShortDate(stock.manufactureDate) : null,
    }
  })
}
