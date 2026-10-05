"use server"

import { PieceComponentKind } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { getStoreIdForRead } from "@/lib/store-context"
import { resolveStoreName } from "@/lib/invite-email"
import { tagPurity } from "@/components/inventory/stock/stock-qr-label"

/** One printed barcode tag — see StockBarcodeLabel. */
export type StockBarcodeTagData = {
  id: string
  storeName: string
  /** Encoded in the barcode and printed under it: the tag number, else the stock code. */
  code: string
  karat: string | null
  grossWeight: string | null
  netWeight: string | null
  /** One "DIA : ct / pcs" line per diamond row. */
  diamonds: { carat: string; pieces: number | null }[]
  /** Every non-diamond stone, summed. */
  otherStoneCarat: string
  otherStonePieces: number
}

type StoneLine = { name: string; carat: number; pieces: number | null }

const isDiamond = (name: string) => /diamond/i.test(name)

/** "18K" → "18 KT", the way it's written on a tag; anything else as-is. */
function karatLabel(purity: string | null) {
  if (!purity) return null
  const match = /^(\d+)\s*K(T)?$/i.exec(purity.trim())
  return match ? `${match[1]} KT` : purity
}

function weight(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  return Number(value).toFixed(3)
}

/**
 * Tag data for the given stock items, scoped to the current store. Stones
 * come from the piece's own stone components when it has them (else its
 * single stone fields), with the piece count taken from the Product's
 * matching stone row — stock rows don't record a count of their own. A
 * piece with no stone data of its own falls back to the Product's rows.
 */
export async function getStockBarcodeTags(ids: string[]): Promise<StockBarcodeTagData[]> {
  if (ids.length === 0) return []
  const storeId = await getStoreIdForRead()

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
        caratWeight: true,
        components: {
          where: { kind: PieceComponentKind.STONE },
          orderBy: { sortOrder: "asc" },
          select: { stoneMetalTypeName: true, caratWeight: true },
        },
        product: {
          select: {
            stoneComponents: {
              orderBy: { sortOrder: "asc" },
              select: { stoneMetalTypeName: true, caratWeight: true, pieces: true },
            },
          },
        },
      },
    }),
  ])

  return rows.map((stock) => {
    const productStones = stock.product?.stoneComponents ?? []

    // Pcs for the nth stock row named X = the product's nth row named X.
    const seen = new Map<string, number>()
    const piecesFor = (name: string) => {
      const nth = seen.get(name) ?? 0
      seen.set(name, nth + 1)
      return productStones.filter((row) => row.stoneMetalTypeName === name)[nth]?.pieces ?? null
    }

    let stones: StoneLine[] = stock.components
      .filter((row) => row.stoneMetalTypeName)
      .map((row) => ({
        name: row.stoneMetalTypeName!,
        carat: Number(row.caratWeight ?? 0),
        pieces: piecesFor(row.stoneMetalTypeName!),
      }))

    if (stones.length === 0 && stock.stoneMetalTypeName) {
      stones = [
        {
          name: stock.stoneMetalTypeName,
          carat: Number(stock.caratWeight ?? 0),
          pieces: piecesFor(stock.stoneMetalTypeName),
        },
      ]
    }

    if (stones.length === 0) {
      stones = productStones.map((row) => ({
        name: row.stoneMetalTypeName,
        carat: Number(row.caratWeight ?? 0),
        pieces: row.pieces,
      }))
    }

    const others = stones.filter((stone) => !isDiamond(stone.name))

    return {
      id: stock.id,
      storeName,
      code: stock.tagNumber || stock.stockCode,
      karat: karatLabel(tagPurity(stock.purityLabel, stock.purity)),
      grossWeight: weight(stock.grossWeight),
      netWeight: weight(stock.netWeight),
      diamonds: stones
        .filter((stone) => isDiamond(stone.name))
        .map((stone) => ({ carat: stone.carat.toFixed(2), pieces: stone.pieces })),
      otherStoneCarat: Number(others.reduce((sum, stone) => sum + stone.carat, 0).toFixed(2)).toString(),
      otherStonePieces: others.reduce((sum, stone) => sum + (stone.pieces ?? 0), 0),
    }
  })
}
