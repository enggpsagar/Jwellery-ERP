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
  storeMetalPurity: { select: { label: true, sellingPrice: true } },
  defaultMakingCharge: true,
  defaultMakingChargeType: true,
  metalComponents: {
    orderBy: { sortOrder: "asc" },
    take: 1,
    select: { gstRateId: true, storeMetalPurity: { select: { label: true } } },
  },
} satisfies Prisma.ProductSelect;

type ProductDetails = Prisma.ProductGetPayload<{ select: typeof stockOptionProductDetailsSelect }>;

export type StockOptionProductDetails = {
  categoryId: string | null;
  categoryName: string | null;
  categoryTypeId: string | null;
  categoryTypeName: string | null;
  targetStyleId: string | null;
  targetStyleName: string | null;
  /** Fallback for a stock row with no purityLabel of its own. */
  productPurityLabel: string | null;
  /** The Product's first Metal row's GST Rate (Add Product). */
  gstRateId: string | null;
  defaultMakingCharge: number | null;
  defaultMakingChargeType: "FIXED" | "PERCENTAGE";
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
    gstRateId: metal?.gstRateId ?? null,
    defaultMakingCharge: product.defaultMakingCharge != null ? Number(product.defaultMakingCharge) : null,
    defaultMakingChargeType: product.defaultMakingChargeType,
  };
}
