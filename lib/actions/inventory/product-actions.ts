"use server";

import { revalidatePath } from "next/cache";
import { ChargeType, PurityType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { getLocationScope, resolveWritableLocationId } from "@/lib/location-scope";
import { UNASSIGNED_METAL_TYPE } from "@/lib/business-units";
import type { ProductFormState } from "@/lib/inventory/product-types";
import { buildExcelExport } from "@/lib/excel-export";

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
};

type ExportProductsParams = {
  selectedIds?: string[];
  search?: string;
  sortBy?: string;
  sortOrder?: ProductSortOrder;
  type?: string;
};

function getProductWhere(storeId: string, search?: string, metalTypeId?: string) {
  const query = String(search || "").trim();

  return {
    storeId,
    ...(metalTypeId === UNASSIGNED_METAL_TYPE
      ? { metalTypeId: null }
      : metalTypeId
        ? { metalTypeId }
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

function getProductOrderBy(
  sortBy: ProductSortBy = "createdAt",
  sortOrder: ProductSortOrder = "desc",
) {
  if (sortBy === "name") return { name: sortOrder };
  if (sortBy === "productCode") return { productCode: sortOrder };
  if (sortBy === "category") return { category: { name: sortOrder } };
  if (sortBy === "categoryType") return { categoryType: { name: sortOrder } };
  if (sortBy === "metalType") return { metalType: { name: sortOrder } };
  if (sortBy === "defaultPurity") return { defaultPurity: sortOrder };
  if (sortBy === "defaultNetWeight") return { defaultNetWeight: sortOrder };
  if (sortBy === "isActive") return { isActive: sortOrder };
  return { createdAt: sortOrder };
}

function mapProductRow(row: {
  id: string;
  productCode: string;
  name: string;
  category: { name: string } | null;
  categoryType: { name: string } | null;
  metalType: { name: string } | null;
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
  const where = getProductWhere(storeId, search, params.metalTypeId);
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

  const products = rows.map(mapProductRow);
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
    : getProductWhere(storeId, params.search, params.type);

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

    const { fileName, fileBase64 } = buildExcelExport(
      rows,
      "Products",
      "products",
    );

    return {
      success: true,
      message: "Products exported successfully.",
      fileName,
      fileBase64,
    };
  } catch (error) {
    console.error("exportProductsToExcel error:", error);
    return {
      success: false,
      message: "Failed to export products.",
    };
  }
}

export async function getProductById(id: string) {
  const storeId = await requireStoreScope();

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
    const productCode = String(formData.get("productCode") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();

    const categoryId = String(formData.get("categoryId") ?? "").trim();
    const categoryTypeId = parseNullableString(formData.get("categoryTypeId"));
    const metalTypeId = String(formData.get("metalTypeId") ?? "").trim();
    const stoneOriginOptionId = parseNullableString(
      formData.get("stoneOriginOptionId"),
    );

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

    if (!productCode) {
      errors.productCode = ["Product code is required"];
    }

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
        message: "Please fix the form errors.",
        errors,
      };
    }

    const existing = await prisma.product.findFirst({
      where: { productCode, storeId },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        message: "Product code already exists.",
        errors: {
          productCode: ["This product code is already in use."],
        },
      };
    }

    const createdProduct = await prisma.product.create({
      select: { id: true, name: true, productCode: true },
      data: {
        storeId,
        productCode,
        name,
        categoryId,
        categoryTypeId,
        metalTypeId,
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
    console.error("createProduct error:", error);

    return {
      success: false,
      message: "Failed to create product.",
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
    const productCode = String(formData.get("productCode") || "").trim();
    const name = String(formData.get("name") || "").trim();

    const categoryId = String(formData.get("categoryId") ?? "").trim();
    const categoryTypeId = parseNullableString(formData.get("categoryTypeId"));
    const metalTypeId = String(formData.get("metalTypeId") ?? "").trim();
    const stoneOriginOptionId = parseNullableString(
      formData.get("stoneOriginOptionId"),
    );

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

    if (!productCode) {
      errors.productCode = ["Product code is required"];
    }

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

    const existing = await prisma.product.findFirst({
      where: {
        productCode,
        storeId,
        NOT: { id },
      },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        message: "Product code already exists",
        errors: {
          productCode: ["This product code is already in use"],
        },
      };
    }

   const { count } = await prisma.product.updateMany({
  where: { id, storeId },
  data: {
    productCode,
    name,
    categoryId,
    categoryTypeId,
    metalTypeId,
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
    console.error("updateProduct error:", error);
    return {
      success: false,
      message: "Failed to update product",
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
            "This product cannot be deleted because inventory or transaction records are linked to it. Please first remove all stock entries for this product. If any stock is already used in sales or karigar jobs, remove those dependent records first.",
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
    console.error("deleteProduct error:", error);
    return {
      success: false,
      message: "Failed to delete product",
      errors: {},
    };
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
