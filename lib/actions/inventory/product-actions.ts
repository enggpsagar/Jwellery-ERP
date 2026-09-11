"use server";

import { revalidatePath } from "next/cache";
import { ChargeType, PurityType, TargetStyle, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope, getStoreIdForRead } from "@/lib/store-context";
import { actionErrorMessage } from "@/lib/action-error";
import { getLocationScope, resolveWritableLocationId } from "@/lib/location-scope";
import { UNASSIGNED_METAL_TYPE } from "@/lib/business-units";
import type { ProductFormState } from "@/lib/inventory/product-types";
import { buildSkuPrefix, TARGET_STYLE_LABEL } from "@/lib/inventory/product-sku";
import { PURITY_LABELS } from "@/lib/purity";
import {
  buildExcelExport,
  buildCsvExportBase64,
  buildPdfExportBase64,
  buildMultiSheetExcelExport,
  parseExcelUpload,
} from "@/lib/excel-export";
import { logger } from "@/lib/logger";

function parseNullableString(value: FormDataEntryValue | null) {
  const parsed = String(value || "").trim();
  return parsed.length ? parsed : null;
}

function parseOptionalEnum<T extends string>(
  value: FormDataEntryValue | null,
  allowed: readonly T[],
): T | null {
  const parsed = String(value || "").trim();
  if (!parsed) return null;
  return allowed.includes(parsed as T) ? (parsed as T) : null;
}

function parseNullableDecimal(
  value: FormDataEntryValue | null
): number | null {
  const parsed = String(value ?? "").trim();

  if (!parsed) {
    return null;
  }

  const number = Number(parsed);

  return Number.isNaN(number) ? null : number;
}

function parseBoolean(value: FormDataEntryValue | null) {
  return String(value || "") === "true";
}

/**
 * Convert Prisma product row into plain JSON-safe object
 * so it can be passed from Server Component to Client Component.
 */
function serializeProduct(product: {
  id: string;
  productCode: string;
  name: string;
  categoryId: string | null;
  categoryTypeId: string | null;
  metalTypeId: string | null;
  targetStyle: TargetStyle | null;
  stoneOriginOptionId: string | null;
  category: { id: string; name: string } | null;
  categoryType: { id: string; name: string } | null;
  metalType: {
    id: string;
    name: string;
    isGemstone: boolean;
  } | null;
  stoneOriginOption: { id: string; name: string } | null;
  defaultPurity: PurityType | null;
  defaultMakingCharge: { toString(): string } | null;
  defaultMakingChargeType: ChargeType;
  defaultStoneCharge: { toString(): string } | null;
  defaultStoneChargeType: ChargeType;
  defaultGrossWeight: { toString(): string } | null;
  defaultNetWeight: { toString(): string } | null;
  defaultStoneWeight: { toString(): string } | null;
  defaultCaratWeight: { toString(): string } | null;
  hasStoneComponent: boolean;
  defaultStoneRate: { toString(): string } | null;
  defaultStoneMetalTypeName: string | null;
  defaultStoneTypeNames: string | null;
  designCode: string | null;
  hsnCode: string | null;
  description: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: product.id,
    productCode: product.productCode,
    name: product.name,
    categoryId: product.categoryId,
    categoryTypeId: product.categoryTypeId,
    metalTypeId: product.metalTypeId,
    targetStyle: product.targetStyle,
    stoneOriginOptionId: product.stoneOriginOptionId,
    category: product.category,
    categoryType: product.categoryType,
    metalType: product.metalType,
    stoneOriginOption: product.stoneOriginOption,
    defaultPurity: product.defaultPurity,
    defaultMakingCharge: product.defaultMakingCharge?.toString() ?? null,
    defaultMakingChargeType: product.defaultMakingChargeType,
    defaultStoneCharge: product.defaultStoneCharge?.toString() ?? null,
    defaultStoneChargeType: product.defaultStoneChargeType,
    defaultGrossWeight: product.defaultGrossWeight?.toString() ?? null,
    defaultNetWeight: product.defaultNetWeight?.toString() ?? null,
    defaultStoneWeight: product.defaultStoneWeight?.toString() ?? null,
    defaultCaratWeight: product.defaultCaratWeight?.toString() ?? null,
    hasStoneComponent: product.hasStoneComponent,
    defaultStoneRate: product.defaultStoneRate?.toString() ?? null,
    defaultStoneMetalTypeName: product.defaultStoneMetalTypeName,
    defaultStoneTypeNames: product.defaultStoneTypeNames,
    designCode: product.designCode,
    hsnCode: product.hsnCode,
    description: product.description,
    notes: product.notes,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

const PRODUCT_RELATIONS = {
  category: { select: { id: true, name: true } },
  categoryType: { select: { id: true, name: true } },
  metalType: {
    select: { id: true, name: true, isGemstone: true },
  },
  stoneOriginOption: { select: { id: true, name: true } },
} as const;

export type ProductSortBy =
  | "name"
  | "productCode"
  | "createdAt"
  | "category"
  | "categoryType"
  | "metalType"
  | "defaultPurity"
  | "defaultNetWeight"
  | "isActive";
export type ProductSortOrder = "asc" | "desc";

export type GetProductsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: ProductSortBy;
  sortOrder?: ProductSortOrder;
  /** Filters by the store's own StoreMetal id (Settings > Taxonomy) — or
   * "UNASSIGNED" for products with no metal set. Dynamic: whatever the
   * store has configured, not a fixed set of categories. */
  metalTypeId?: string;
  /** "ACTIVE" | "INACTIVE" — otherwise (including "ALL"/undefined) every
   * product matches, same convention as DataTableToolbar's other status
   * filters. This is the only way to actually see just the inactive
   * products — active-first sort alone still shows them, just at the end. */
  status?: string;
};

type ExportProductsParams = {
  selectedIds?: string[];
  search?: string;
  sortBy?: string;
  sortOrder?: ProductSortOrder;
  type?: string;
  status?: string;
  format?: "csv" | "xlsx" | "pdf";
};

function getProductWhere(
  storeId: string,
  search?: string,
  metalTypeId?: string,
  status?: string,
) {
  const query = String(search || "").trim();

  return {
    storeId,
    ...(metalTypeId === UNASSIGNED_METAL_TYPE
      ? { metalTypeId: null }
      : metalTypeId
        ? { metalTypeId }
        : {}),
    ...(status === "ACTIVE"
      ? { isActive: true }
      : status === "INACTIVE"
        ? { isActive: false }
        : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { productCode: { contains: query, mode: "insensitive" as const } },
            { designCode: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

// Active products always sort ahead of inactive ones, regardless of which
// column the user picked — that column only decides ordering *within* each
// of those two groups (skipped when the user explicitly sorted by Status
// itself, since prepending it there would be redundant).
function getProductOrderBy(
  sortBy: ProductSortBy = "createdAt",
  sortOrder: ProductSortOrder = "desc",
) {
  const primary =
    sortBy === "name" ? { name: sortOrder }
    : sortBy === "productCode" ? { productCode: sortOrder }
    : sortBy === "category" ? { category: { name: sortOrder } }
    : sortBy === "categoryType" ? { categoryType: { name: sortOrder } }
    : sortBy === "metalType" ? { metalType: { name: sortOrder } }
    : sortBy === "defaultPurity" ? { defaultPurity: sortOrder }
    : sortBy === "defaultNetWeight" ? { defaultNetWeight: sortOrder }
    : sortBy === "isActive" ? { isActive: sortOrder }
    : { createdAt: sortOrder };

  if (sortBy === "isActive") return [primary];
  return [{ isActive: "desc" as const }, primary];
}

function mapProductRow(row: {
  id: string;
  productCode: string;
  name: string;
  category: { name: string } | null;
  categoryType: { name: string } | null;
  metalType: { name: string } | null;
  targetStyle: TargetStyle | null;
  defaultPurity: PurityType | null;
  defaultMakingCharge: { toString(): string } | null;
  defaultMakingChargeType: ChargeType;
  defaultStoneCharge: { toString(): string } | null;
  defaultStoneChargeType: ChargeType;
  defaultGrossWeight: { toString(): string } | null;
  defaultNetWeight: { toString(): string } | null;
  defaultStoneWeight: { toString(): string } | null;
  defaultCaratWeight: { toString(): string } | null;
  hasStoneComponent: boolean;
  defaultStoneRate: { toString(): string } | null;
  defaultStoneMetalTypeName: string | null;
  defaultStoneTypeNames: string | null;
  designCode: string | null;
  hsnCode: string | null;
  description: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    productCode: row.productCode,
    name: row.name,
    category: row.category?.name ?? "-",
    ornamentType: row.categoryType?.name ?? null,
    metalType: row.metalType?.name ?? "-",
    targetStyle: row.targetStyle,
    defaultPurity: row.defaultPurity,
    defaultMakingCharge:
      row.defaultMakingCharge != null ? Number(row.defaultMakingCharge) : null,
    defaultMakingChargeType: row.defaultMakingChargeType,
    defaultStoneCharge:
      row.defaultStoneCharge != null ? Number(row.defaultStoneCharge) : null,
    defaultStoneChargeType: row.defaultStoneChargeType,
    defaultGrossWeight:
      row.defaultGrossWeight != null ? Number(row.defaultGrossWeight) : null,
    defaultNetWeight:
      row.defaultNetWeight != null ? Number(row.defaultNetWeight) : null,
    defaultStoneWeight:
      row.defaultStoneWeight != null ? Number(row.defaultStoneWeight) : null,
    defaultCaratWeight:
      row.defaultCaratWeight != null ? Number(row.defaultCaratWeight) : null,
    hasStoneComponent: row.hasStoneComponent,
    defaultStoneRate:
      row.defaultStoneRate != null ? Number(row.defaultStoneRate) : null,
    defaultStoneMetalTypeName: row.defaultStoneMetalTypeName,
    defaultStoneTypeNames: row.defaultStoneTypeNames,
    designCode: row.designCode,
    hsnCode: row.hsnCode,
    description: row.description,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getProducts(params: GetProductsParams = {}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));
  const search = String(params.search || "").trim();
  const sortBy: ProductSortBy = params.sortBy || "createdAt";
  const sortOrder: ProductSortOrder = params.sortOrder || "desc";

  const storeId = await requireStoreScope();
  const where = getProductWhere(storeId, search, params.metalTypeId, params.status);
  const orderBy = getProductOrderBy(sortBy, sortOrder);

  const [totalCount, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: PRODUCT_RELATIONS,
    }),
  ]);

  // How many pieces of this product design are currently in stock, summed
  // across every InventoryStock lot it has (a design can have several —
  // different purchases, different pieces) — quantity is already the live
  // remaining count (it only reaches 0, flipping status to SOLD, as pieces
  // sell), so a plain sum needs no status filter of its own.
  const stockQtyByProductId = new Map<string, number>();
  if (rows.length > 0) {
    const stockTotals = await prisma.inventoryStock.groupBy({
      by: ["productId"],
      where: { storeId, productId: { in: rows.map((row) => row.id) } },
      _sum: { quantity: true },
    });
    for (const total of stockTotals) {
      stockQtyByProductId.set(total.productId, total._sum.quantity ?? 0);
    }
  }

  const products = rows.map((row) => ({
    ...mapProductRow(row),
    stockQty: stockQtyByProductId.get(row.id) ?? 0,
  }));
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    products,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

async function getAllProductsForExport(params: ExportProductsParams = {}) {
  const validSortBy: ProductSortBy[] = [
    "name",
    "productCode",
    "createdAt",
    "category",
    "categoryType",
    "metalType",
    "defaultPurity",
    "defaultNetWeight",
    "isActive",
  ];
  const sortBy: ProductSortBy = validSortBy.includes(params.sortBy as ProductSortBy)
    ? (params.sortBy as ProductSortBy)
    : "createdAt";
  const sortOrder: ProductSortOrder = params.sortOrder || "desc";

  const storeId = await requireStoreScope();
  const where = params.selectedIds?.length
    ? {
        id: { in: params.selectedIds },
        storeId,
      }
    : getProductWhere(storeId, params.search, params.type, params.status);

  const rows = await prisma.product.findMany({
    where,
    orderBy: getProductOrderBy(sortBy, sortOrder),
    include: PRODUCT_RELATIONS,
  });

  return rows.map(mapProductRow);
}

export async function exportProductsToExcel(
  params: ExportProductsParams = {},
): Promise<{
  success: boolean;
  message: string;
  fileName?: string;
  fileBase64?: string;
}> {
  try {
    const products = await getAllProductsForExport(params);

    if (!products.length) {
      return {
        success: false,
        message: "No products found to export.",
      };
    }

    const rows = products.map((product, index) => ({
      "Sr. No.": index + 1,
      "Product Code": product.productCode,
      Name: product.name,
      Category: product.category || "-",
      Type: product.ornamentType || "-",
      "Metal Type": product.metalType || "-",
      Purity: product.defaultPurity || "-",
      "Design Code": product.designCode || "-",
      "HSN Code": product.hsnCode || "-",
      "Default Making Charge": product.defaultMakingCharge ?? "-",
      "Making Charge Type": product.defaultMakingChargeType,
      "Default Stone Charge": product.defaultStoneCharge ?? "-",
      "Stone Charge Type": product.defaultStoneChargeType,
      "Gross Weight (g)": product.defaultGrossWeight ?? "-",
      "Net Weight (g)": product.defaultNetWeight ?? "-",
      "Stone Weight (g)": product.defaultStoneWeight ?? "-",
      "Carat Weight (ct)": product.defaultCaratWeight ?? "-",
      "Has Stone Component": product.hasStoneComponent ? "Yes" : "No",
      "Stone Rate (₹/ct)": product.defaultStoneRate ?? "-",
      Stone: product.defaultStoneMetalTypeName ?? "-",
      "Stone Types": product.defaultStoneTypeNames ?? "-",
      Description: product.description || "-",
      Notes: product.notes || "-",
      Status: product.isActive ? "Active" : "Inactive",
      "Created At": product.createdAt
        ? new Date(product.createdAt).toLocaleString("en-IN")
        : "-",
    }));

    const { fileName, fileBase64 } =
      params.format === "csv"
        ? buildCsvExportBase64(rows, "products")
        : params.format === "pdf"
          ? buildPdfExportBase64(rows, "Products", "products")
          : buildExcelExport(rows, "Products", "products");

    return {
      success: true,
      message: "Products exported successfully.",
      fileName,
      fileBase64,
    };
  } catch (error) {
    logger.error("exportProductsToExcel error", error);
    return {
      success: false,
      message: actionErrorMessage(error, "Failed to export products."),
    };
  }
}

export async function getProductById(id: string) {
  const storeId = await getStoreIdForRead();

  const product = await prisma.product.findFirst({
    where: { id, storeId },
    include: PRODUCT_RELATIONS,
  });

  if (!product) return null;
  return serializeProduct(product);
}

/**
 * Validate that categoryId / metalTypeId / (optional) categoryTypeId /
 * (optional) stoneOriginOptionId reference real, store-scoped rows. Returns
 * field errors for anything that doesn't resolve.
 */
async function validateTaxonomySelection(
  storeId: string,
  categoryId: string,
  metalTypeId: string,
  categoryTypeId: string | null,
  stoneOriginOptionId: string | null,
): Promise<Record<string, string[]>> {
  const errors: Record<string, string[]> = {};

  const [categoryRow, metalRow, typeRow, originRow] = await Promise.all([
    categoryId
      ? prisma.storeCategory.findFirst({
          where: { id: categoryId, storeId },
          select: { id: true },
        })
      : Promise.resolve(null),
    metalTypeId
      ? prisma.storeMetal.findFirst({
          where: { id: metalTypeId, storeId },
          select: { id: true },
        })
      : Promise.resolve(null),
    categoryTypeId
      ? prisma.storeCategoryType.findFirst({
          where: { id: categoryTypeId, storeId, categoryId: categoryId || undefined },
          select: { id: true },
        })
      : Promise.resolve(null),
    stoneOriginOptionId
      ? prisma.storeMetalOrigin.findFirst({
          where: { id: stoneOriginOptionId, storeId, storeMetalId: metalTypeId || undefined },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (!categoryId) {
    errors.categoryId = ["Category is required"];
  } else if (!categoryRow) {
    errors.categoryId = ["Selected category is invalid"];
  }

  if (!metalTypeId) {
    errors.metalTypeId = ["Metal type is required"];
  } else if (!metalRow) {
    errors.metalTypeId = ["Selected metal type is invalid"];
  }

  if (categoryTypeId && !typeRow) {
    errors.categoryTypeId = ["Selected type is invalid for this category"];
  }

  if (stoneOriginOptionId && !originRow) {
    errors.stoneOriginOptionId = ["Selected Stone Type is invalid for this metal"];
  }

  return errors;
}

export async function createProduct(
  prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  try {
    const name = String(formData.get("name") ?? "").trim();

    const categoryId = String(formData.get("categoryId") ?? "").trim();
    const categoryTypeId = parseNullableString(formData.get("categoryTypeId"));
    const metalTypeId = String(formData.get("metalTypeId") ?? "").trim();
    const stoneOriginOptionId = parseNullableString(
      formData.get("stoneOriginOptionId"),
    );

    const targetStyle = parseOptionalEnum(
      formData.get("targetStyle"),
      Object.values(TargetStyle),
    ) as TargetStyle | null;

    const defaultPurity = parseOptionalEnum(
      formData.get("defaultPurity"),
      Object.values(PurityType),
    ) as PurityType | null;

    const defaultMakingCharge = parseNullableDecimal(
      formData.get("defaultMakingCharge"),
    );

    const defaultMakingChargeType =
      parseOptionalEnum(
        formData.get("defaultMakingChargeType"),
        Object.values(ChargeType),
      ) ?? ChargeType.FIXED;

    const defaultStoneCharge = parseNullableDecimal(
      formData.get("defaultStoneCharge"),
    );

    const defaultStoneChargeType =
      parseOptionalEnum(
        formData.get("defaultStoneChargeType"),
        Object.values(ChargeType),
      ) ?? ChargeType.FIXED;

    // Typical weights for the design. Optional: plenty of products (coins,
    // bars, loose stones) are sold by count, and a blank must stay unknown
    // rather than becoming zero.
    const defaultGrossWeight = parseNullableDecimal(
      formData.get("defaultGrossWeight"),
    );
    const defaultNetWeight = parseNullableDecimal(
      formData.get("defaultNetWeight"),
    );
    const defaultStoneWeight = parseNullableDecimal(
      formData.get("defaultStoneWeight"),
    );
    const defaultCaratWeight = parseNullableDecimal(
      formData.get("defaultCaratWeight"),
    );
    const hasStoneComponent = parseBoolean(formData.get("hasStoneComponent"));
    const defaultStoneRate = parseNullableDecimal(
      formData.get("defaultStoneRate"),
    );
    const defaultStoneMetalTypeName = parseNullableString(
      formData.get("defaultStoneMetalTypeName"),
    );
    const defaultStoneTypeNames = parseNullableString(
      formData.get("defaultStoneTypeNames"),
    );

    const designCode = parseNullableString(formData.get("designCode"));
    const hsnCode = parseNullableString(formData.get("hsnCode"));
    const description = parseNullableString(formData.get("description"));
    const notes = parseNullableString(formData.get("notes"));
    const isActive = parseBoolean(formData.get("isActive"));

    const errors: Record<string, string[]> = {};

    if (!name) {
      errors.name = ["Product name is required"];
    }

    if (!targetStyle) {
      errors.targetStyle = ["Style is required"];
    }

    const storeId = await requireStoreScope();

    Object.assign(
      errors,
      await validateTaxonomySelection(
        storeId,
        categoryId,
        metalTypeId,
        categoryTypeId,
        stoneOriginOptionId,
      ),
    );

    if (Object.keys(errors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors.",
        errors,
      };
    }

    // SKU generation needs the actual names behind the ids validated above
    // (validateTaxonomySelection only confirms they exist) — one small
    // lookup rather than re-plumbing names through from the client, which
    // can't be trusted anyway (a stale/tampered label would silently mint
    // a wrong-looking SKU).
    const [metalRow, categoryTypeRow, categoryRow, businessSettings] = await Promise.all([
      prisma.storeMetal.findFirst({ where: { id: metalTypeId, storeId }, select: { name: true } }),
      categoryTypeId
        ? prisma.storeCategoryType.findFirst({ where: { id: categoryTypeId, storeId }, select: { name: true } })
        : Promise.resolve(null),
      prisma.storeCategory.findFirst({ where: { id: categoryId, storeId }, select: { name: true } }),
      prisma.businessSettings.findUnique({ where: { storeId }, select: { skuFormat: true } }),
    ]);

    const skuPrefix = buildSkuPrefix({
      metalName: metalRow?.name ?? "X",
      purity: defaultPurity,
      targetStyle: targetStyle as TargetStyle,
      categoryTypeName: categoryTypeRow?.name ?? null,
      categoryName: categoryRow?.name ?? null,
      format: businessSettings?.skuFormat,
    });

    // Sequence is scoped to this exact prefix (e.g. "G22-LR"), not global —
    // two different designs (say a Silver Chain) start back at 001 under
    // their own prefix. Max-based rather than a plain count, same reasoning
    // as generateStockCode's own comment: a deleted product regresses a
    // count onto a code that already exists, and a retry would recompute
    // the identical value and collide again.
    const existingCodes = await prisma.product.findMany({
      where: { storeId, productCode: { startsWith: `${skuPrefix}-` } },
      select: { productCode: true },
    });
    const highestSeq = existingCodes.reduce((max, row) => {
      const match = new RegExp(`^${skuPrefix}-(\\d+)$`).exec(row.productCode);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);

    let createdProduct: { id: string; name: string; productCode: string } | null = null;

    for (let attempt = 0; attempt < 5 && !createdProduct; attempt += 1) {
      const productCode = `${skuPrefix}-${String(highestSeq + 1 + attempt).padStart(3, "0")}`;

      try {
        createdProduct = await prisma.product.create({
          select: { id: true, name: true, productCode: true },
          data: {
            storeId,
            productCode,
            name,
            categoryId,
            categoryTypeId,
            metalTypeId,
            targetStyle: targetStyle as TargetStyle,
            stoneOriginOptionId,
            defaultPurity,
            defaultMakingCharge,
            defaultMakingChargeType,
            defaultStoneCharge,
            defaultStoneChargeType,
            defaultGrossWeight,
            defaultNetWeight,
            defaultStoneWeight,
            defaultCaratWeight,
            hasStoneComponent,
            defaultStoneRate,
            defaultStoneMetalTypeName,
            defaultStoneTypeNames,
            designCode,
            hsnCode,
            description,
            notes,
            isActive,
          },
        });
      } catch (error) {
        const isDuplicateCode =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
        if (!isDuplicateCode) throw error;
      }
    }

    if (!createdProduct) {
      return {
        success: false,
        message: "Could not generate a unique SKU — please try again.",
        errors: {},
      };
    }

    // Optional stock entry, opted into on the product form. Everything the
    // row needs beyond a quantity already lives on the product, so nothing
    // is asked twice. A blank quantity means 0 — the product becomes
    // stockable with none on hand, which is the requested default rather
    // than an error.
    let stockCreated = false;

    if (String(formData.get("createStockEntry") ?? "") === "true") {
      const rawQuantity = String(formData.get("stockQuantity") ?? "").trim();
      const quantity = rawQuantity === "" ? 0 : Number(rawQuantity);

      if (!Number.isFinite(quantity) || quantity < 0) {
        return {
          success: false,
          message: "Stock quantity must be 0 or more.",
          errors: { stockQuantity: ["Enter 0 or a positive whole number"] },
        };
      }

      // See resolveWritableLocationId's own doc comment — without this, a
      // location-restricted Staff user submitting no location at all saved
      // the stock row with locationId: null, which then never matches their
      // own location-scoped list afterward.
      const rawLocationId = String(formData.get("locationId") ?? "").trim();
      const locationScope = await getLocationScope();
      const locationResolution = await resolveWritableLocationId(
        storeId,
        rawLocationId || null,
        locationScope,
      );
      if (!locationResolution.ok) {
        return {
          success: false,
          message: locationResolution.message,
          errors: { locationId: [locationResolution.message] },
        };
      }
      const resolvedLocationId = locationResolution.locationId;

      // Same max-based derivation as the product code above: a COUNT
      // regresses after a delete onto a code that already exists, and a
      // retry would recount to the identical value and collide again.
      const existingCodes = await prisma.inventoryStock.findMany({
        where: { storeId, stockCode: { startsWith: "STK-" } },
        select: { stockCode: true },
      });

      const highest = existingCodes.reduce((max, row) => {
        const match = /^STK-(?:\d{4}-)?(\d+)$/.exec(row.stockCode);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0);

      const year = new Date().getFullYear();

      // The product row is already committed by this point, so a failure
      // here must not be reported as "product creation failed" — that would
      // send the user back to create a product that already exists. Retry a
      // colliding stock code, and if it still won't take, keep the success
      // and say the stock entry is the part that didn't happen.
      for (let attempt = 0; attempt < 5 && !stockCreated; attempt += 1) {
        try {
          await prisma.inventoryStock.create({
            data: {
              storeId,
              productId: createdProduct.id,
              stockCode: `STK-${year}-${String(highest + 1 + attempt).padStart(4, "0")}`,
              quantity: Math.trunc(quantity),
              locationId: resolvedLocationId,
              metalTypeId: metalTypeId || null,
              purity: defaultPurity,
              makingCharge: defaultMakingCharge,
              makingChargeType: defaultMakingChargeType,
              stoneCharge: defaultStoneCharge,
              // Seeded from the product so the piece is weighed once. The
              // stock row stays the per-piece record and can be corrected
              // against the scale without touching the design.
              grossWeight: defaultGrossWeight,
              netWeight: defaultNetWeight,
              stoneWeight: defaultStoneWeight,
              caratWeight: defaultCaratWeight,
              stoneRate: defaultStoneRate,
              stoneMetalTypeName: defaultStoneMetalTypeName,
              stoneTypeNames: defaultStoneTypeNames,
            },
          });

          stockCreated = true;
        } catch (error) {
          const isDuplicateCode =
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002";

          if (!isDuplicateCode) throw error;
        }
      }

      if (!stockCreated) {
        revalidatePath("/inventory/products");

        return {
          success: true,
          message:
            "Product created, but the stock entry could not be — add it from Inventory → Stock.",
          errors: {},
          product: createdProduct,
        };
      }
    }


    revalidatePath("/inventory");
    revalidatePath("/inventory/products");

    return {
      success: true,
      message: stockCreated
        ? "Product created, with a stock entry."
        : "Product created successfully.",
      errors: {},
      product: createdProduct,
    };
  } catch (error) {
    logger.error("createProduct error", error);

    return {
      success: false,
      message: actionErrorMessage(error, "Failed to create product."),
      errors: {},
    };
  }
}

export async function updateProduct(
  id: string,
  prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  try {
    // productCode is immutable after creation — same convention as every
    // other auto-generated code in this app (invoiceNumber, stockCode,
    // jobNumber) — so it's simply never read from the edit form.
    const name = String(formData.get("name") || "").trim();

    const categoryId = String(formData.get("categoryId") ?? "").trim();
    const categoryTypeId = parseNullableString(formData.get("categoryTypeId"));
    const metalTypeId = String(formData.get("metalTypeId") ?? "").trim();
    const stoneOriginOptionId = parseNullableString(
      formData.get("stoneOriginOptionId"),
    );

    const targetStyle = parseOptionalEnum(
      formData.get("targetStyle"),
      Object.values(TargetStyle),
    ) as TargetStyle | null;

    const defaultPurity = parseOptionalEnum(
      formData.get("defaultPurity"),
      Object.values(PurityType),
    ) as PurityType | null;
    const defaultMakingCharge = parseNullableDecimal(
      formData.get("defaultMakingCharge"),
    );

    const defaultMakingChargeType =
      parseOptionalEnum(
        formData.get("defaultMakingChargeType"),
        Object.values(ChargeType),
      ) ?? ChargeType.FIXED;

    const defaultStoneCharge = parseNullableDecimal(
      formData.get("defaultStoneCharge"),
    );

    const defaultStoneChargeType =
      parseOptionalEnum(
        formData.get("defaultStoneChargeType"),
        Object.values(ChargeType),
      ) ?? ChargeType.FIXED;

    // Typical weights for the design. Optional: plenty of products (coins,
    // bars, loose stones) are sold by count, and a blank must stay unknown
    // rather than becoming zero.
    const defaultGrossWeight = parseNullableDecimal(
      formData.get("defaultGrossWeight"),
    );
    const defaultNetWeight = parseNullableDecimal(
      formData.get("defaultNetWeight"),
    );
    const defaultStoneWeight = parseNullableDecimal(
      formData.get("defaultStoneWeight"),
    );
    const defaultCaratWeight = parseNullableDecimal(
      formData.get("defaultCaratWeight"),
    );
    const hasStoneComponent = parseBoolean(formData.get("hasStoneComponent"));
    const defaultStoneRate = parseNullableDecimal(
      formData.get("defaultStoneRate"),
    );
    const defaultStoneMetalTypeName = parseNullableString(
      formData.get("defaultStoneMetalTypeName"),
    );
    const defaultStoneTypeNames = parseNullableString(
      formData.get("defaultStoneTypeNames"),
    );

    const designCode = parseNullableString(formData.get("designCode"));
    const hsnCode = parseNullableString(formData.get("hsnCode"));
    const description = parseNullableString(formData.get("description"));
    const notes = parseNullableString(formData.get("notes"));
    const isActive = parseBoolean(formData.get("isActive"));

    const errors: Record<string, string[]> = {};

    if (!name) {
      errors.name = ["Product name is required"];
    }

    const storeId = await requireStoreScope();

    Object.assign(
      errors,
      await validateTaxonomySelection(
        storeId,
        categoryId,
        metalTypeId,
        categoryTypeId,
        stoneOriginOptionId,
      ),
    );

    if (Object.keys(errors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors,
      };
    }

   const { count } = await prisma.product.updateMany({
  where: { id, storeId },
  data: {
    name,
    categoryId,
    categoryTypeId,
    metalTypeId,
    targetStyle,
    stoneOriginOptionId,
    defaultPurity,
    defaultMakingCharge,
    defaultMakingChargeType,
    defaultStoneCharge,
    defaultStoneChargeType,
    defaultGrossWeight,
    defaultNetWeight,
    defaultStoneWeight,
    defaultCaratWeight,
    hasStoneComponent,
    defaultStoneRate,
    defaultStoneMetalTypeName,
    defaultStoneTypeNames,
    designCode,
    hsnCode,
    description,
    notes,
    isActive,
  },
})

    if (count === 0) {
      return {
        success: false,
        message: "Product not found",
        errors: {},
      };
    }

    revalidatePath("/inventory");
    revalidatePath("/inventory/products");
    revalidatePath(`/inventory/products/${id}`);
    revalidatePath(`/inventory/products/${id}/edit`);

    return {
      success: true,
      message: "Product updated successfully",
      errors: {},
    };
  } catch (error) {
    logger.error("updateProduct error", error);
    return {
      success: false,
      message: actionErrorMessage(error, "Failed to update product"),
      errors: {},
    };
  }
}

/**
 * Delete product only when:
 * 1) No stock rows exist for this product
 * 2) Therefore no invoice / karigar downstream dependency should remain
 */
export async function deleteProduct(id: string): Promise<ProductFormState> {
  try {
    const storeId = await requireStoreScope();

    const product = await prisma.product.findFirst({
      where: { id, storeId },
      select: {
        id: true,
        name: true,
        stockItems: {
          select: {
            id: true,
            stockCode: true,
            quantity: true,
            invoiceItems: {
              select: { id: true },
              take: 1,
            },
            karigarJobs: {
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!product) {
      return {
        success: false,
        message: "Product not found",
        errors: {},
      };
    }

    if (product.stockItems.length > 0) {
      const stockLinkedToInvoices = product.stockItems.some(
        (stock) => stock.invoiceItems.length > 0,
      );

      const stockLinkedToKarigarJobs = product.stockItems.some(
        (stock) => stock.karigarJobs.length > 0,
      );

      if (stockLinkedToInvoices || stockLinkedToKarigarJobs) {
        return {
          success: false,
          message:
            "This product cannot be deleted because inventory or transaction records are linked to it. Please first remove all stock entries for this product. If any stock is already used in sales or artisan jobs, remove those dependent records first.",
          errors: {},
        };
      }

      return {
        success: false,
        message:
          "This product cannot be deleted because inventory exists for it. Please first clear / remove all stock entries for this product, then try again.",
        errors: {},
      };
    }

    await prisma.product.delete({
      where: { id },
    });

    revalidatePath("/inventory");
    revalidatePath("/inventory/products");

    return {
      success: true,
      message: "Product deleted successfully",
      errors: {},
    };
  } catch (error) {
    logger.error("deleteProduct error", error);
    return {
      success: false,
      message: actionErrorMessage(error, "Failed to delete product"),
      errors: {},
    };
  }
}

/** Flips a product's Active/Inactive status — same immediate, no-confirm
 * toggle as enableKarigar/disableKarigar, used by the Status switch on the
 * product detail view instead of a separate confirm dialog. */
export async function disableProduct(id: string): Promise<ProductFormState> {
  try {
    const storeId = await requireStoreScope();

    const { count } = await prisma.product.updateMany({
      where: { id, storeId },
      data: { isActive: false },
    });

    if (count === 0) {
      return { success: false, message: "Product not found", errors: {} };
    }

    revalidatePath("/inventory/products");
    revalidatePath(`/inventory/products/${id}`);

    return { success: true, message: "Product marked inactive", errors: {} };
  } catch (error) {
    logger.error("disableProduct error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update product"), errors: {} };
  }
}

export async function enableProduct(id: string): Promise<ProductFormState> {
  try {
    const storeId = await requireStoreScope();

    const { count } = await prisma.product.updateMany({
      where: { id, storeId },
      data: { isActive: true },
    });

    if (count === 0) {
      return { success: false, message: "Product not found", errors: {} };
    }

    revalidatePath("/inventory/products");
    revalidatePath(`/inventory/products/${id}`);

    return { success: true, message: "Product marked active", errors: {} };
  } catch (error) {
    logger.error("enableProduct error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to update product"), errors: {} };
  }
}

export type BulkDeleteResult = {
  deletedCount: number;
  failures: { id: string; message: string }[];
};

/**
 * Deletes each selected product through the exact same deleteProduct()
 * call a single-row delete uses — never a bare deleteMany — so a bulk
 * selection can't bypass the stock/dependency guard just because several
 * rows were ticked at once. Partial success is expected and reported per
 * row, not treated as a whole-batch failure.
 */
export async function bulkDeleteProducts(ids: string[]): Promise<BulkDeleteResult> {
  const failures: BulkDeleteResult["failures"] = [];
  let deletedCount = 0;

  for (const id of ids) {
    const result = await deleteProduct(id);
    if (result.success) {
      deletedCount++;
    } else {
      failures.push({ id, message: result.message });
    }
  }

  return { deletedCount, failures };
}

export type ProductImportResult = {
  success: boolean;
  message: string;
  createdCount?: number;
  /** Row-level problems. Populated only when nothing was created — nothing
   * is written until the whole file is clean. */
  errors?: string[];
};

const CHARGE_TYPE_LABELS: Record<string, ChargeType> = {
  fixed: ChargeType.FIXED,
  percentage: ChargeType.PERCENTAGE,
};

/**
 * A downloadable .xlsx showing the expected columns and one filled-in
 * example row. Category/Metal Type/Style/Purity are entered as the same
 * human-readable names shown throughout the app (not ids or enum keys) —
 * importProductsFromExcel resolves them against this store's own Settings >
 * Taxonomy entries. No SKU column: it's auto-generated on import exactly
 * like the single "Add Product" form generates it.
 */
export async function getProductImportTemplate(): Promise<{
  fileName: string;
  fileBase64: string;
}> {
  await requireStoreScope();

  const example = {
    "Product Name": "Classic Gold Ring",
    Category: "Ring",
    "Metal Type": "Gold",
    Style: "Ladies",
    "Category Type": "",
    "Stone Type": "",
    Purity: "Gold 22K",
    "Making Charge": 500,
    "Making Charge Type": "Fixed",
    "Stone Charge": "",
    "Stone Charge Type": "Fixed",
    "Gross Weight": 8.5,
    "Net Weight": 8.2,
    "Stone Weight": "",
    "Carat Weight": "",
    "Has Stone Component": "No",
    "Stone Rate": "",
    "Stone Metal Type Name": "",
    "Stone Type Names": "",
    "Design Code": "RG-001",
    "HSN Code": "7113",
    Description: "22K gold ladies ring",
    Notes: "",
    Active: "Yes",
  };

  return buildMultiSheetExcelExport(
    [{ name: "Products Import", rows: [example], columns: Object.keys(example) }],
    "products-import-template",
  );
}

function productImportCell(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim();
}

/** Parses a required decimal cell: "" is valid (→ null), anything else that
 * isn't a finite number is an error. Returns `undefined` as a sentinel for
 * "this row already has an error, skip further checks on it" — callers
 * check `error` first. */
function productImportDecimal(
  row: Record<string, unknown>,
  key: string,
): { value: number | null; error: string | null } {
  const raw = productImportCell(row, key);
  if (raw === "") return { value: null, error: null };
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { value: null, error: `${key} must be a number` };
  }
  return { value, error: null };
}

function productImportYesNo(row: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const raw = productImportCell(row, key).toLowerCase();
  if (raw === "yes" || raw === "true") return true;
  if (raw === "no" || raw === "false") return false;
  return fallback;
}

/**
 * Bulk-adds products from one spreadsheet — mirrors importInventoryStockFromExcel's
 * contract exactly, but with the added complexity of resolving Category/
 * Metal Type/Category Type/Stone Type names to ids and auto-generating each
 * row's SKU, same as the single "Add Product" form does (see createProduct
 * above) — just computed as one batch instead of N sequential DB round
 * trips. Validation happens in a first pass with zero DB writes; SKU
 * sequence numbers are only assigned once every row in the file is known to
 * be valid, so a bad row never even reaches the sequence-numbering step.
 */
export async function importProductsFromExcel(
  formData: FormData,
): Promise<ProductImportResult> {
  try {
    const storeId = await requireStoreScope();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return { success: false, message: "Choose a .xlsx or .csv file to import." };
    }

    const rows = parseExcelUpload(await file.arrayBuffer());

    if (!rows.length) {
      return { success: false, message: "That file has no rows to import." };
    }

    const [categories, metals, categoryTypes, metalOrigins, businessSettings] = await Promise.all([
      prisma.storeCategory.findMany({ where: { storeId }, select: { id: true, name: true } }),
      prisma.storeMetal.findMany({ where: { storeId }, select: { id: true, name: true } }),
      prisma.storeCategoryType.findMany({
        where: { storeId },
        select: { id: true, name: true, categoryId: true },
      }),
      prisma.storeMetalOrigin.findMany({
        where: { storeId },
        select: { id: true, name: true, storeMetalId: true },
      }),
      prisma.businessSettings.findUnique({ where: { storeId }, select: { skuFormat: true } }),
    ]);

    const categoryByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]));
    const metalByName = new Map(metals.map((m) => [m.name.trim().toLowerCase(), m]));

    const categoryTypesByCategory = new Map<string, Map<string, { id: string; name: string }>>();
    for (const type of categoryTypes) {
      if (!categoryTypesByCategory.has(type.categoryId)) {
        categoryTypesByCategory.set(type.categoryId, new Map());
      }
      categoryTypesByCategory.get(type.categoryId)!.set(type.name.trim().toLowerCase(), type);
    }

    const metalOriginsByMetal = new Map<string, Map<string, { id: string; name: string }>>();
    for (const origin of metalOrigins) {
      if (!metalOriginsByMetal.has(origin.storeMetalId)) {
        metalOriginsByMetal.set(origin.storeMetalId, new Map());
      }
      metalOriginsByMetal.get(origin.storeMetalId)!.set(origin.name.trim().toLowerCase(), origin);
    }

    const purityByLabel = new Map(
      (Object.entries(PURITY_LABELS) as [PurityType, string][]).map(([value, label]) => [
        label.toLowerCase(),
        value,
      ]),
    );
    const styleByLabel = new Map(
      (Object.entries(TARGET_STYLE_LABEL) as [TargetStyle, string][]).map(([value, label]) => [
        label.toLowerCase(),
        value,
      ]),
    );

    type ResolvedRow = {
      skuPrefix: string;
      fields: Omit<Prisma.ProductCreateManyInput, "storeId" | "productCode">;
    };

    const errors: string[] = [];
    const resolvedRows: ResolvedRow[] = [];

    for (const [index, row] of rows.entries()) {
      // +2 = one for the header row, one for 1-based spreadsheet numbering.
      const line = index + 2;
      const rowErrors: string[] = [];

      const name = productImportCell(row, "Product Name");
      if (!name) rowErrors.push("Product Name is required");

      const categoryName = productImportCell(row, "Category");
      const category = categoryName ? categoryByName.get(categoryName.toLowerCase()) : undefined;
      if (!categoryName) rowErrors.push("Category is required");
      else if (!category) rowErrors.push(`No category found named "${categoryName}"`);

      const metalName = productImportCell(row, "Metal Type");
      const metal = metalName ? metalByName.get(metalName.toLowerCase()) : undefined;
      if (!metalName) rowErrors.push("Metal Type is required");
      else if (!metal) rowErrors.push(`No metal type found named "${metalName}"`);

      const styleRaw = productImportCell(row, "Style");
      const targetStyle = styleRaw ? styleByLabel.get(styleRaw.toLowerCase()) : undefined;
      if (!styleRaw) rowErrors.push("Style is required");
      else if (!targetStyle) {
        rowErrors.push(`"${styleRaw}" is not a valid Style — use Ladies, Gents, Kids, or Unisex`);
      }

      const categoryTypeName = productImportCell(row, "Category Type");
      let categoryType: { id: string; name: string } | undefined;
      if (categoryTypeName && category) {
        categoryType = categoryTypesByCategory.get(category.id)?.get(categoryTypeName.toLowerCase());
        if (!categoryType) {
          rowErrors.push(`Category Type "${categoryTypeName}" does not belong to category "${categoryName}"`);
        }
      }

      const stoneTypeName = productImportCell(row, "Stone Type");
      let stoneOrigin: { id: string; name: string } | undefined;
      if (stoneTypeName && metal) {
        stoneOrigin = metalOriginsByMetal.get(metal.id)?.get(stoneTypeName.toLowerCase());
        if (!stoneOrigin) {
          rowErrors.push(`Stone Type "${stoneTypeName}" does not belong to metal type "${metalName}"`);
        }
      }

      const purityRaw = productImportCell(row, "Purity");
      let defaultPurity: PurityType | null = null;
      if (purityRaw) {
        const matched = purityByLabel.get(purityRaw.toLowerCase());
        if (!matched) {
          rowErrors.push(`"${purityRaw}" is not a valid Purity — see the template's Purity column for valid values`);
        } else {
          defaultPurity = matched;
        }
      }

      const makingChargeTypeRaw = productImportCell(row, "Making Charge Type");
      let defaultMakingChargeType: ChargeType = ChargeType.FIXED;
      if (makingChargeTypeRaw) {
        const matched = CHARGE_TYPE_LABELS[makingChargeTypeRaw.toLowerCase()];
        if (!matched) {
          rowErrors.push(`"${makingChargeTypeRaw}" is not a valid Making Charge Type — use Fixed or Percentage`);
        } else {
          defaultMakingChargeType = matched;
        }
      }

      const stoneChargeTypeRaw = productImportCell(row, "Stone Charge Type");
      let defaultStoneChargeType: ChargeType = ChargeType.FIXED;
      if (stoneChargeTypeRaw) {
        const matched = CHARGE_TYPE_LABELS[stoneChargeTypeRaw.toLowerCase()];
        if (!matched) {
          rowErrors.push(`"${stoneChargeTypeRaw}" is not a valid Stone Charge Type — use Fixed or Percentage`);
        } else {
          defaultStoneChargeType = matched;
        }
      }

      const numericFields: Record<string, number | null> = {};
      let numericError = false;
      for (const key of [
        "Making Charge",
        "Stone Charge",
        "Gross Weight",
        "Net Weight",
        "Stone Weight",
        "Carat Weight",
        "Stone Rate",
      ]) {
        const { value, error } = productImportDecimal(row, key);
        if (error) {
          rowErrors.push(error);
          numericError = true;
        }
        numericFields[key] = value;
      }

      if (rowErrors.length > 0) {
        for (const message of rowErrors) errors.push(`Row ${line}: ${message}`);
        continue;
      }

      // Every check above passed, so category/metal/targetStyle are
      // guaranteed non-null here even though TypeScript can't tell from the
      // control flow alone.
      const resolvedCategory = category!;
      const resolvedMetal = metal!;
      const resolvedTargetStyle = targetStyle!;
      const hasStoneComponent = productImportYesNo(row, "Has Stone Component", false);
      const isActive = productImportYesNo(row, "Active", true);

      const skuPrefix = buildSkuPrefix({
        metalName: resolvedMetal.name,
        purity: defaultPurity,
        targetStyle: resolvedTargetStyle,
        categoryTypeName: categoryType?.name ?? null,
        categoryName: resolvedCategory.name,
        format: businessSettings?.skuFormat,
      });

      resolvedRows.push({
        skuPrefix,
        fields: {
          name,
          categoryId: resolvedCategory.id,
          categoryTypeId: categoryType?.id ?? null,
          metalTypeId: resolvedMetal.id,
          targetStyle: resolvedTargetStyle,
          stoneOriginOptionId: stoneOrigin?.id ?? null,
          defaultPurity,
          defaultMakingCharge: numericFields["Making Charge"],
          defaultMakingChargeType,
          defaultStoneCharge: numericFields["Stone Charge"],
          defaultStoneChargeType,
          defaultGrossWeight: numericFields["Gross Weight"],
          defaultNetWeight: numericFields["Net Weight"],
          defaultStoneWeight: numericFields["Stone Weight"],
          defaultCaratWeight: numericFields["Carat Weight"],
          hasStoneComponent,
          defaultStoneRate: hasStoneComponent ? numericFields["Stone Rate"] : null,
          defaultStoneMetalTypeName: hasStoneComponent
            ? productImportCell(row, "Stone Metal Type Name") || null
            : null,
          defaultStoneTypeNames: hasStoneComponent
            ? productImportCell(row, "Stone Type Names") || null
            : null,
          designCode: productImportCell(row, "Design Code") || null,
          hsnCode: productImportCell(row, "HSN Code") || null,
          description: productImportCell(row, "Description") || null,
          notes: productImportCell(row, "Notes") || null,
          isActive,
        },
      });
    }

    if (errors.length > 0) {
      return {
        success: false,
        message: "Nothing was imported. Fix these rows and try again.",
        errors,
      };
    }

    if (!resolvedRows.length) {
      return { success: false, message: "That file has no rows to import." };
    }

    // Sequence numbers are scoped per exact prefix (e.g. "G22-LR"), same as
    // createProduct's own single-row generation — a different design starts
    // back at 001 under its own prefix. Batched into one query across every
    // distinct prefix this file actually needs, rather than one query per
    // row or per prefix.
    const distinctPrefixes = [...new Set(resolvedRows.map((r) => r.skuPrefix))];
    const existingCodes = await prisma.product.findMany({
      where: {
        storeId,
        OR: distinctPrefixes.map((prefix) => ({ productCode: { startsWith: `${prefix}-` } })),
      },
      select: { productCode: true },
    });

    // Anchored full-match per prefix (same shape createProduct's own
    // single-row regex uses) rather than a loose "ends with digits" scan —
    // a productCode only counts toward a prefix's sequence if it's exactly
    // "<prefix>-<digits>", not merely startsWith(prefix).
    const prefixPatterns = new Map(
      distinctPrefixes.map((prefix) => [
        prefix,
        new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`),
      ]),
    );
    const highestSeqByPrefix = new Map<string, number>(distinctPrefixes.map((p) => [p, 0]));
    for (const { productCode } of existingCodes) {
      for (const prefix of distinctPrefixes) {
        const match = prefixPatterns.get(prefix)!.exec(productCode);
        if (match) {
          highestSeqByPrefix.set(prefix, Math.max(highestSeqByPrefix.get(prefix)!, Number(match[1])));
          break;
        }
      }
    }

    const toCreate: Prisma.ProductCreateManyInput[] = resolvedRows.map((row) => {
      const nextSeq = (highestSeqByPrefix.get(row.skuPrefix) ?? 0) + 1;
      highestSeqByPrefix.set(row.skuPrefix, nextSeq);
      return {
        storeId,
        productCode: `${row.skuPrefix}-${String(nextSeq).padStart(3, "0")}`,
        ...row.fields,
      };
    });

    await prisma.product.createMany({ data: toCreate });

    revalidatePath("/inventory");
    revalidatePath("/inventory/products");

    return {
      success: true,
      message: `Added ${toCreate.length} ${toCreate.length === 1 ? "product" : "products"}.`,
      createdCount: toCreate.length,
    };
  } catch (error) {
    logger.error("importProductsFromExcel error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to import products.") };
  }
}
