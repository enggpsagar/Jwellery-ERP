/**
 * The catalog details a stock picker carries over onto a sale line when a
 * piece is picked — shared by every document form's stock list (Invoice,
 * Kacha, Quotation) so picking the same piece fills the same fields
 * everywhere: Category/Type/Style, the Product's own per-Metal Purity (when
 * the stock row predates purityLabel), the first Metal row's GST Rate and
 * the Product's default Making Charge.
 */

import type { Prisma } from "@prisma/client";

export const stockOptionProductDetailsSelect = {
  category: { select: { id: true, name: true } },
  categoryType: { select: { id: true, name: true } },
  targetStyle: { select: { id: true, name: true } },
  storeMetalPurity: { select: { label: true, sellingPrice: true, finenessPercent: true } },
  hasStoneComponent: true,
  hsnCode: true,
  defaultMakingCharge: true,
  defaultMakingChargeType: true,
  // Every metal / stone row (Add Product's components): the first metal's
  // GST rate and purity feed the fields below; all of them feed a picked
  // piece's multi-part rows (lib/inventory/stock-piece-rows.ts).
  metalComponents: {
    orderBy: { sortOrder: "asc" },
    select: {
      metalTypeId: true,
      grossWeight: true,
      netWeight: true,
      gstRateId: true,
      metalType: { select: { name: true, isGemstone: true } },
      storeMetalPurity: { select: { label: true, finenessPercent: true, sellingPrice: true } },
    },
  },
  stoneComponents: {
    orderBy: { sortOrder: "asc" },
    select: {
      stoneMetalTypeName: true,
      stoneTypeNames: true,
      caratWeight: true,
      stoneWeight: true,
      stoneRate: true,
      stoneCharge: true,
      gstRateId: true,
      pieces: true,
      clarity: true,
      certificateNumber: true,
    },
  },
} satisfies Prisma.ProductSelect;

export type ProductDetails = Prisma.ProductGetPayload<{ select: typeof stockOptionProductDetailsSelect }>;

export type StockOptionProductDetails = {
  categoryId: string | null;
  categoryName: string | null;
  categoryTypeId: string | null;
  categoryTypeName: string | null;
  targetStyleId: string | null;
  targetStyleName: string | null;
  /** Fallback for a stock row with no purityLabel of its own. */
  productPurityLabel: string | null;
  /** The Product's purity fineness % (18K = 75) — prices a line from
   * today's fine rate when no selling price is configured. */
  purityFineness: number | null;
  /** Add Product's "Includes a Stone" — the stock row's own stone fields
   * can be blank (no rate) on a piece that still has one. */
  productHasStone: boolean;
  /** The Product's first Metal row's GST Rate (Add Product). */
  gstRateId: string | null;
  defaultMakingCharge: number | null;
  defaultMakingChargeType: "FIXED" | "PERCENTAGE";
  /** The Product's HSN code — searchable in the stock picker. */
  productHsnCode: string | null;
};

export function toStockOptionProductDetails(product: ProductDetails): StockOptionProductDetails {
  const metal = product.metalComponents[0];
  return {
    categoryId: product.category?.id ?? null,
    categoryName: product.category?.name ?? null,
    categoryTypeId: product.categoryType?.id ?? null,
    categoryTypeName: product.categoryType?.name ?? null,
    targetStyleId: product.targetStyle?.id ?? null,
    targetStyleName: product.targetStyle?.name ?? null,
    productPurityLabel: product.storeMetalPurity?.label ?? metal?.storeMetalPurity?.label ?? null,
    purityFineness: (() => {
      const fineness = product.storeMetalPurity?.finenessPercent ?? metal?.storeMetalPurity?.finenessPercent;
      return fineness != null ? Number(fineness) : null;
    })(),
    productHasStone: product.hasStoneComponent,
    gstRateId: metal?.gstRateId ?? null,
    defaultMakingCharge: product.defaultMakingCharge != null ? Number(product.defaultMakingCharge) : null,
    defaultMakingChargeType: product.defaultMakingChargeType,
    productHsnCode: product.hsnCode ?? null,
  };
}
