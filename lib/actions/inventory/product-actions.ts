"use server";

import { revalidatePath } from "next/cache";
import { ChargeType, InventoryFinish, PurityType, Prisma } from "@prisma/client";
import { finishLabel, parseFinishLabel } from "@/lib/inventory/finish";
import { PRODUCT_SHEET_COLUMNS, PRODUCT_SHEET_FOLLOW_ON_EXAMPLE, productSheetColumns, productSheetHeaders, productSheetInstructions } from "@/lib/inventory/product-sheet";
import { dropdownsFor, hiddenSheetHeaders, pickSheetRow, stripHiddenSheetColumns } from "@/lib/sheet-features";
import { getSheetFeatures } from "@/lib/sheet-features.server";

import { prisma } from "@/lib/prisma";
import { getFineWeightResolver } from "@/lib/fine-weight";
import { requireStoreScope, getStoreIdForRead } from "@/lib/store-context";
import { getWeightFormat } from "@/lib/weight-settings.server";
import { actionErrorMessage } from "@/lib/action-error";
import { getLocationScope, resolveWritableLocationId } from "@/lib/location-scope";
import { UNASSIGNED_METAL_TYPE } from "@/lib/business-units";
import type { ProductFormState } from "@/lib/inventory/product-types";
import { buildSkuPrefix } from "@/lib/inventory/product-sku";
import { PURITY_LABELS, matchLegacyPurityType } from "@/lib/purity";
import { classifyPurityFamily } from "@/lib/business-units";
import {
  buildCsvExportBase64,
  buildPdfExportBase64,
  buildImportTemplateWithDropdowns,
  parseExcelUpload,
} from "@/lib/excel-export";
import { logger } from "@/lib/logger";
import { namesAsCandidates, suggestFrom } from "@/lib/import-suggest";
import { parseDateRangeBoundary } from "@/lib/date-range";

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

function toChargeTypeInput(value: unknown): ChargeType {
  return value === ChargeType.PERCENTAGE ? ChargeType.PERCENTAGE : ChargeType.FIXED;
}

function toNumberOrNull(value: unknown): number | null {
  const num = Number(value);
  return typeof value === "number" || typeof value === "string"
    ? (Number.isFinite(num) ? num : null)
    : null;
}

// Client-submitted shape for one row of the Product form's Metal/Stone
// component repeaters (see metalComponentsJson/stoneComponentsJson below) —
// mirrors PurchaseLineItemInput's own "trust the ids, validate ownership,
// coerce everything else" convention (lib/actions/purchase-actions.ts).
type MetalComponentInput = {
  metalTypeId?: string;
  storeMetalPurityId?: string | null;
  grossWeight?: number | string | null;
  netWeight?: number | string | null;
  gstRateId?: string | null;
};

type StoneComponentInput = {
  stoneMetalTypeName?: string;
  stoneTypeNames?: string | null;
  caratWeight?: number | string | null;
  stoneWeight?: number | string | null;
  stoneRate?: number | string | null;
  stoneCharge?: number | string | null;
  stoneChargeType?: string;
  clarity?: string | null;
  certificateNumber?: string | null;
  pieces?: number | string | null;
  gstRateId?: string | null;
};

/**
 * Parses metalComponentsJson off the submitted FormData and validates each
 * row's metalTypeId/storeMetalPurityId are real, store-scoped rows — the
 * same ownership check validateTaxonomySelection already does for the
 * single legacy metalTypeId field, just per-row. Requires at least one row,
 * matching today's "Metal type is required" rule on the single field.
 */
async function parseAndValidateMetalComponents(
  storeId: string,
  formData: FormData,
): Promise<{ components: MetalComponentInput[]; error: string | null }> {
  let components: MetalComponentInput[] = [];
  try {
    components = JSON.parse(String(formData.get("metalComponentsJson") || "[]"));
  } catch {
    return { components: [], error: "Invalid metal components." };
  }

  if (!Array.isArray(components) || components.length === 0) {
    return { components: [], error: "Add at least one metal." };
  }

  const rows = await Promise.all(
    components.map(async (component) => {
      const metalTypeId = String(component.metalTypeId || "").trim();
      const storeMetalPurityId = component.storeMetalPurityId
        ? String(component.storeMetalPurityId).trim()
        : null;
      const gstRateId = component.gstRateId ? String(component.gstRateId).trim() : null;

      if (!metalTypeId) return null;

      const metalRow = await prisma.storeMetal.findFirst({
        where: { id: metalTypeId, storeId },
        select: { id: true },
      });
      if (!metalRow) return null;

      if (storeMetalPurityId) {
        const purityRow = await prisma.storeMetalPurity.findFirst({
          where: { id: storeMetalPurityId, storeId, storeMetalId: metalTypeId },
          select: { id: true },
        });
        if (!purityRow) return null;
      }

      if (gstRateId) {
        const gstRateRow = await prisma.gstRate.findFirst({
          where: { id: gstRateId, storeId },
          select: { id: true },
        });
        if (!gstRateRow) return null;
      }

      return { metalTypeId, storeMetalPurityId, gstRateId };
    }),
  );

  if (rows.some((row) => row === null)) {
    return { components: [], error: "One or more metal components are invalid." };
  }

  return { components: components as MetalComponentInput[], error: null };
}

/** A stone row's piece count — a whole number ≥ 0, else null. */
function toPiecesOrNull(value: unknown): number | null {
  const n = Number(value);
  return value != null && String(value).trim() !== "" && Number.isInteger(n) && n >= 0 ? n : null;
}

async function parseStoneComponents(
  storeId: string,
  formData: FormData,
): Promise<{ components: StoneComponentInput[]; error: string | null }> {
  let components: StoneComponentInput[] = [];
  try {
    components = JSON.parse(String(formData.get("stoneComponentsJson") || "[]"));
  } catch {
    return { components: [], error: "Invalid stone components." };
  }

  if (!Array.isArray(components)) {
    return { components: [], error: "Invalid stone components." };
  }

  // A row missing its own stone name is dropped rather than rejected — the
  // same forgiving handling the single-stone form already gave a blank
  // "Includes a Stone" toggle left half-filled.
  const named = components.filter((component) => String(component.stoneMetalTypeName || "").trim());

  // A row that DOES name a Stone must also name at least one Stone Type —
  // Stone Types no longer default to "all checked" (see
  // StoneComponentFields' own doc comment), so a store owner has to make
  // an actual choice rather than silently submitting none at all.
  const missingType = named.find((component) => !String(component.stoneTypeNames || "").trim());
  if (missingType) {
    return {
      components: [],
      error: `Select at least one Stone Type for ${missingType.stoneMetalTypeName}.`,
    };
  }

  const gstRateIds = [...new Set(named.map((c) => c.gstRateId).filter((id): id is string => !!id))];
  if (gstRateIds.length > 0) {
    const validRows = await prisma.gstRate.findMany({
      where: { id: { in: gstRateIds }, storeId },
      select: { id: true },
    });
    const validIds = new Set(validRows.map((row) => row.id));
    const invalid = named.find((c) => c.gstRateId && !validIds.has(c.gstRateId));
    if (invalid) {
      return { components: [], error: "One or more stone GST rates are invalid." };
    }
  }

  return { components: named, error: null };
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
  targetStyleId: string | null;
  stoneOriginOptionId: string | null;
  category: { id: string; name: string } | null;
  categoryType: { id: string; name: string } | null;
  metalType: {
    id: string;
    name: string;
    isGemstone: boolean;
  } | null;
  stoneOriginOption: { id: string; name: string } | null;
  targetStyle: { id: string; name: string } | null;
  defaultPurity: PurityType | null;
  storeMetalPurityId: string | null;
  defaultMakingCharge: { toString(): string } | null;
  defaultMakingChargeType: ChargeType;
  defaultStoneCharge: { toString(): string } | null;
  defaultStoneChargeType: ChargeType;
  defaultFinish: InventoryFinish;
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
  imageUrls?: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Only present when fetched via getProductById (see its own include) —
  // the paginated list/export queries never load these, so this function
  // stays usable for both without them.
  metalComponents?: {
    id: string;
    metalTypeId: string;
    metalType: { id: string; name: string };
    storeMetalPurityId: string | null;
    storeMetalPurity: { id: string; label: string } | null;
    grossWeight: { toString(): string } | null;
    netWeight: { toString(): string } | null;
    gstRateId: string | null;
  }[];
  stoneComponents?: {
    id: string;
    stoneMetalTypeName: string;
    stoneTypeNames: string | null;
    caratWeight: { toString(): string } | null;
    stoneWeight: { toString(): string } | null;
    stoneRate: { toString(): string } | null;
    stoneCharge: { toString(): string } | null;
    stoneChargeType: ChargeType;
    clarity: string | null;
    certificateNumber: string | null;
    pieces: number | null;
    gstRateId: string | null;
    gstRate?: { name: string; ratePercent: { toString(): string } } | null;
  }[];
}) {
  return {
    id: product.id,
    productCode: product.productCode,
    name: product.name,
    categoryId: product.categoryId,
    categoryTypeId: product.categoryTypeId,
    metalTypeId: product.metalTypeId,
    targetStyleId: product.targetStyleId,
    stoneOriginOptionId: product.stoneOriginOptionId,
    category: product.category,
    categoryType: product.categoryType,
    metalType: product.metalType,
    targetStyle: product.targetStyle,
    stoneOriginOption: product.stoneOriginOption,
    defaultPurity: product.defaultPurity,
    storeMetalPurityId: product.storeMetalPurityId,
    defaultMakingCharge: product.defaultMakingCharge?.toString() ?? null,
    defaultMakingChargeType: product.defaultMakingChargeType,
    defaultStoneCharge: product.defaultStoneCharge?.toString() ?? null,
    defaultStoneChargeType: product.defaultStoneChargeType,
    defaultFinish: product.defaultFinish,
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
    imageUrls: product.imageUrls ?? [],
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    metalComponents: (product.metalComponents ?? []).map((component) => ({
      id: component.id,
      metalTypeId: component.metalTypeId,
      metalTypeName: component.metalType.name,
      storeMetalPurityId: component.storeMetalPurityId,
      storeMetalPurityLabel: component.storeMetalPurity?.label ?? null,
      grossWeight: component.grossWeight?.toString() ?? null,
      netWeight: component.netWeight?.toString() ?? null,
      gstRateId: component.gstRateId,
    })),
    stoneComponents: (product.stoneComponents ?? []).map((component) => ({
      id: component.id,
      stoneMetalTypeName: component.stoneMetalTypeName,
      stoneTypeNames: component.stoneTypeNames,
      caratWeight: component.caratWeight?.toString() ?? null,
      stoneWeight: component.stoneWeight?.toString() ?? null,
      stoneRate: component.stoneRate?.toString() ?? null,
      stoneCharge: component.stoneCharge?.toString() ?? null,
      stoneChargeType: component.stoneChargeType,
      clarity: component.clarity,
      certificateNumber: component.certificateNumber,
      pieces: component.pieces,
      gstRateId: component.gstRateId,
      // Rate names are free text — only append the % when the name doesn't
      // already say it ("GST 3%" shouldn't read "GST 3% (3%)").
      gstRateLabel: component.gstRate
        ? component.gstRate.name.includes("%")
          ? component.gstRate.name
          : `${component.gstRate.name} (${Number(component.gstRate.ratePercent.toString())}%)`
        : null,
    })),
  };
}

const PRODUCT_RELATIONS = {
  category: { select: { id: true, name: true } },
  categoryType: { select: { id: true, name: true } },
  metalType: {
    select: { id: true, name: true, isGemstone: true },
  },
  stoneOriginOption: { select: { id: true, name: true } },
  targetStyle: { select: { id: true, name: true } },
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
  | "defaultGrossWeight"
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
  dateFrom?: string;
  dateTo?: string;
  /** StoreCategory / StoreCategoryType ids (Settings > Taxonomy). */
  categoryId?: string;
  categoryTypeId?: string;
  /** StoreMetalOrigin id (Natural / Lab-Grown ...). */
  stoneOriginOptionId?: string;
};

type ExportProductsParams = {
  selectedIds?: string[];
  search?: string;
  sortBy?: string;
  sortOrder?: ProductSortOrder;
  type?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  categoryType?: string;
  stoneType?: string;
  format?: "csv" | "xlsx" | "pdf";
};

function getProductWhere(
  storeId: string,
  search?: string,
  metalTypeId?: string,
  status?: string,
  dateFrom?: string,
  dateTo?: string,
  categoryId?: string,
  categoryTypeId?: string,
  stoneOriginOptionId?: string,
) {
  const query = String(search || "").trim();
  const from = parseDateRangeBoundary(dateFrom, false);
  const to = parseDateRangeBoundary(dateTo, true);

  return {
    storeId,
    ...(categoryId ? { categoryId } : {}),
    ...(categoryTypeId ? { categoryTypeId } : {}),
    ...(stoneOriginOptionId ? { stoneOriginOptionId } : {}),
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
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { productCode: { contains: query, mode: "insensitive" as const } },
            { designCode: { contains: query, mode: "insensitive" as const } },
            { hsnCode: { contains: query, mode: "insensitive" as const } },
            // IGI / lab certificate number on any of the product's stones.
            { stoneComponents: { some: { certificateNumber: { contains: query, mode: "insensitive" as const } } } },
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
    : sortBy === "defaultGrossWeight" ? { defaultGrossWeight: sortOrder }
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
  targetStyle: { id: string; name: string } | null;
  stoneOriginOption?: { name: string } | null;
  defaultPurity: PurityType | null;
  defaultMakingCharge: { toString(): string } | null;
  defaultMakingChargeType: ChargeType;
  defaultStoneCharge: { toString(): string } | null;
  defaultStoneChargeType: ChargeType;
  defaultFinish: InventoryFinish;
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
    stoneType: row.stoneOriginOption?.name ?? null,
    defaultPurity: row.defaultPurity,
    defaultMakingCharge:
      row.defaultMakingCharge != null ? Number(row.defaultMakingCharge) : null,
    defaultMakingChargeType: row.defaultMakingChargeType,
    defaultStoneCharge:
      row.defaultStoneCharge != null ? Number(row.defaultStoneCharge) : null,
    defaultStoneChargeType: row.defaultStoneChargeType,
    defaultFinish: row.defaultFinish,
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
  const where = getProductWhere(storeId, search, params.metalTypeId, params.status, params.dateFrom, params.dateTo, params.categoryId, params.categoryTypeId, params.stoneOriginOptionId);
  const orderBy = getProductOrderBy(sortBy, sortOrder);

  const fineWeightSelect = {
    metalTypeId: true,
    defaultPurity: true,
    defaultNetWeight: true,
    defaultGrossWeight: true,
    storeMetalPurity: { select: { label: true } },
  } as const;

  const [totalCount, rows, weightSum, stockQtySum, fineWeightOf, fineRows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { ...PRODUCT_RELATIONS, storeMetalPurity: { select: { label: true } } },
    }),
    // Footer totals across every matching product, not just this page.
    prisma.product.aggregate({ where, _sum: { defaultNetWeight: true, defaultGrossWeight: true } }),
    prisma.inventoryStock.aggregate({
      where: { storeId, product: where },
      _sum: { quantity: true },
    }),
    // Products store no fine weight of their own — net × the purity's
    // fineness, same resolver stock rows are stamped with (lib/fine-weight.ts).
    getFineWeightResolver(storeId),
    prisma.product.findMany({ where, select: fineWeightSelect }),
  ]);

  const productFineWeight = (row: {
    metalTypeId: string | null;
    defaultPurity: string | null;
    defaultNetWeight: Prisma.Decimal | null;
    defaultGrossWeight?: Prisma.Decimal | null;
    storeMetalPurity: { label: string } | null;
  }) =>
    fineWeightOf.line({
      metalTypeId: row.metalTypeId,
      purityLabel: row.storeMetalPurity?.label,
      purity: row.defaultPurity,
      netWeight: row.defaultNetWeight,
      grossWeight: row.defaultGrossWeight,
    }).fineWeight;

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
    fineWeight: productFineWeight(row),
  }));
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    products,
    totals: {
      grossWeight: Number(weightSum._sum.defaultGrossWeight ?? 0),
      netWeight: Number(weightSum._sum.defaultNetWeight ?? 0),
      fineWeight: fineRows.reduce((sum, row) => sum + (productFineWeight(row) ?? 0), 0),
      stockQty: stockQtySum._sum.quantity ?? 0,
    },
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
    "defaultGrossWeight",
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
    : getProductWhere(
        storeId,
        params.search,
        params.type,
        // Same Active-only default as the Products page itself, so the
        // export matches what's on screen (no status = Active, not every status).
        params.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
        params.dateFrom,
        params.dateTo,
        params.category,
        params.categoryType,
        params.stoneType,
      );

  const rows = await prisma.product.findMany({
    where,
    orderBy: getProductOrderBy(sortBy, sortOrder),
    include: {
      ...PRODUCT_RELATIONS,
      // The per-metal / per-stone rows the form saves — the export reads
      // purity, GST rates and stone Pcs/Clarity/IGI No. from these.
      storeMetalPurity: { select: { label: true } },
      metalComponents: {
        orderBy: { sortOrder: "asc" },
        include: {
          metalType: { select: { name: true } },
          storeMetalPurity: { select: { label: true } },
          gstRate: { select: { name: true } },
        },
      },
      stoneComponents: { orderBy: { sortOrder: "asc" }, include: { gstRate: { select: { name: true } } } },
    },
  });

  return rows.map((row) => ({
    ...mapProductRow(row),
    purityLabel: row.storeMetalPurity?.label ?? null,
    metals: row.metalComponents,
    stones: row.stoneComponents,
  }));
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

    // Exactly the import template's columns, in its order, with values the
    // import reads back (purity labels, Fixed/Percentage, Yes/No, blank for
    // empty) — so an exported file is a filled-in template. Stock Quantity/
    // Location are per-import choices, so an export leaves them blank.
    const blank = (value: unknown) =>
      value === null || value === undefined || value === "-" ? "" : value;
    const chargeType = (value: ChargeType) => (value === ChargeType.PERCENTAGE ? "Percentage" : "Fixed");
    const num = (value: { toString(): string } | null | undefined) => (value == null ? "" : Number(value));
    // A product with several metals/stones takes several rows: the first
    // carries the product and its first metal + stone; each following row
    // (blank Product Name) carries one more metal and/or stone — the same
    // layout the import reads.
    const metalCells = (metal: (typeof products)[number]["metals"][number] | undefined) =>
      metal
        ? {
            "Metal Type": metal.metalType.name,
            ...(metal.storeMetalPurity ? { Purity: metal.storeMetalPurity.label } : {}),
            "Gross Weight": num(metal.grossWeight),
            "Metal GST Rate": metal.gstRate?.name ?? "",
          }
        : {};
    const stoneCells = (stone: (typeof products)[number]["stones"][number] | undefined) =>
      stone
        ? {
            "Stone Metal Type Name": stone.stoneMetalTypeName,
            "Stone Type Names": stone.stoneTypeNames ?? "",
            "Carat Weight": num(stone.caratWeight),
            "Stone Rate": num(stone.stoneRate),
            "Stone Charge": num(stone.stoneCharge),
            "Stone Charge Type": chargeType(stone.stoneChargeType),
            "Stone Pcs": stone.pieces ?? "",
            "Stone Clarity": stone.clarity ?? "",
            "IGI Certificate No.": stone.certificateNumber ?? "",
            "Stone GST Rate": stone.gstRate?.name ?? "",
            "Stone Weight": num(stone.stoneWeight),
          }
        : {};
    // This store's columns only — a switched-off feature's column (Style,
    // GST Rate, Location) is left out, never its stored value changed.
    const storeId = await requireStoreScope();
    const features = await getSheetFeatures(storeId);
    const headers = productSheetHeaders(features);
    const toRow = (values: Record<string, unknown>) => pickSheetRow(values, headers);

    const rows = products.flatMap((product) => {
      const [firstMetal, ...moreMetals] = product.metals;
      const [firstStone, ...moreStones] = product.stones;
      const first = toRow({
        "Product Code": product.productCode,
        "Product Name": product.name,
        "Metal Type": blank(product.metalType),
        Category: blank(product.category),
        "Category Type": blank(product.ornamentType),
        Style: blank(product.targetStyle?.name),
        "Stone Type": blank(product.stoneType),
        Purity: product.purityLabel ?? (product.defaultPurity ? PURITY_LABELS[product.defaultPurity] : ""),
        "Gross Weight": blank(product.defaultGrossWeight),
        "Has Stone Component": product.hasStoneComponent || firstStone ? "Yes" : "No",
        // Older products saved before per-stone rows: their single stone.
        ...(firstStone
          ? {}
          : {
              "Stone Metal Type Name": blank(product.defaultStoneMetalTypeName),
              "Stone Type Names": blank(product.defaultStoneTypeNames),
              "Carat Weight": blank(product.defaultCaratWeight),
              "Stone Rate": blank(product.defaultStoneRate),
              "Stone Charge": blank(product.defaultStoneCharge),
              "Stone Weight": blank(product.defaultStoneWeight),
            }),
        "Stone Charge Type": chargeType(product.defaultStoneChargeType),
        ...metalCells(firstMetal),
        ...stoneCells(firstStone),
        "Net Weight": blank(product.defaultNetWeight),
        "Making Charge": blank(product.defaultMakingCharge),
        "Making Charge Type": chargeType(product.defaultMakingChargeType),
        "Design Code": blank(product.designCode),
        "HSN Code": blank(product.hsnCode),
        Active: product.isActive ? "Yes" : "No",
        Finish: finishLabel(product.defaultFinish),
        Description: blank(product.description),
        Notes: blank(product.notes),
      });
      const extraCount = Math.max(moreMetals.length, moreStones.length);
      const extras = Array.from({ length: extraCount }, (_, index) =>
        toRow({ ...metalCells(moreMetals[index]), ...stoneCells(moreStones[index]) }),
      );
      return [first, ...extras];
    });

    // The PDF gets its own shorter column set — all 25 export columns on one
    // landscape page left each only a few characters wide, so names, codes
    // and dates broke mid-word. Every column is still in CSV/Excel.
    // Settings > Weights decimals for the PDF's weight text.
    const wf = await getWeightFormat(storeId);
    const pdfRows = () =>
      products.map((product, index) => ({
        "Sr.": index + 1,
        "Product Code": product.productCode,
        Name: product.name,
        Category: product.category || "-",
        Type: product.ornamentType || "-",
        Metal: product.metalType || "-",
        Purity: product.defaultPurity || "-",
        HSN: product.hsnCode || "-",
        "Gross Wt (g)": product.defaultGrossWeight != null ? wf.g(product.defaultGrossWeight) : "-",
        "Net Wt (g)": product.defaultNetWeight != null ? wf.g(product.defaultNetWeight) : "-",
        "Stone Wt (g)": product.defaultStoneWeight != null ? wf.g(product.defaultStoneWeight) : "-",
        "Making Charge":
          product.defaultMakingCharge != null
            ? product.defaultMakingChargeType === "PERCENTAGE"
              ? `${product.defaultMakingCharge}%`
              : `Rs. ${product.defaultMakingCharge}`
            : "-",
        Status: product.isActive ? "Active" : "Inactive",
        Created: product.createdAt
          ? new Date(product.createdAt).toLocaleDateString("en-IN")
          : "-",
      }));

    const { fileName, fileBase64 } =
      params.format === "csv"
        ? buildCsvExportBase64(rows, "products")
        : params.format === "pdf"
          ? buildPdfExportBase64(pdfRows(), "Products", "products")
          : buildImportTemplateWithDropdowns({
              sheetName: "Products",
              rows,
              columns: headers,
              dropdowns: dropdownsFor(await loadProductSheetDropdowns(storeId), headers),
              instructions: { notes: PRODUCT_SHEET_NOTES, rows: productSheetInstructions(features) },
              filePrefix: "products",
            });

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
    include: {
      ...PRODUCT_RELATIONS,
      // Only fetched here (not on the paginated list/export queries that
      // also use PRODUCT_RELATIONS) — the full breakdown only matters on
      // the single-product edit form and detail page.
      metalComponents: {
        orderBy: { sortOrder: "asc" },
        include: { metalType: { select: { id: true, name: true } }, storeMetalPurity: { select: { id: true, label: true } } },
      },
      stoneComponents: {
        orderBy: { sortOrder: "asc" },
        include: { gstRate: { select: { name: true, ratePercent: true } } },
      },
    },
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
  targetStyleId: string | null,
): Promise<Record<string, string[]>> {
  const errors: Record<string, string[]> = {};

  const [categoryRow, metalRow, typeRow, originRow, styleRow] = await Promise.all([
    categoryId
      ? prisma.storeCategory.findFirst({
          where: { id: categoryId, storeId },
          select: { id: true },
        })
      : Promise.resolve(null),
    metalTypeId
      ? prisma.storeMetal.findFirst({
          where: { id: metalTypeId, storeId },
          select: { id: true, isGemstone: true },
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
    targetStyleId
      ? prisma.storeStyle.findFirst({
          where: { id: targetStyleId, storeId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  // Category is an ornament-shape concept (Ring/Bangle/Necklace...) — a
  // loose Diamond/Stone product isn't itself an ornament, so it's never
  // required for the gemstone family, only ever optional if a store has
  // set one up anyway (see getStoreCategoriesForMetal, which already lets
  // a category be tagged to a gemstone metal for exactly that case).
  if (!categoryId) {
    if (!metalRow?.isGemstone) {
      errors.categoryId = ["Category is required"];
    }
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

  if (targetStyleId && !styleRow) {
    errors.targetStyleId = ["Selected style is invalid"];
  }

  return errors;
}

const MAX_PRODUCT_IMAGES = 8;

/**
 * The Add/Edit Product form's "Product Images" list (JSON array of URLs,
 * first = cover). Only URLs on Vercel Blob's public storage host — i.e.
 * ones /api/products/photo actually returned — are kept, so a tampered
 * POST can't make a product render an arbitrary third-party image. Invalid
 * entries are dropped, duplicates removed, and the list capped.
 */
function parseProductImageUrls(value: FormDataEntryValue | null): string[] {
  if (value === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const urls: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "string") continue;
    try {
      const url = new URL(entry);
      if (url.protocol !== "https:" || !url.hostname.endsWith(".public.blob.vercel-storage.com")) continue;
    } catch {
      continue;
    }
    if (!urls.includes(entry)) urls.push(entry);
    if (urls.length === MAX_PRODUCT_IMAGES) break;
  }
  return urls;
}

export async function createProduct(
  prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  try {
    const storeId = await requireStoreScope();
    const businessSettings = await prisma.businessSettings.findUnique({
      where: { storeId },
      select: { skuFormat: true, styleFieldEnabled: true },
    });

    const name = String(formData.get("name") ?? "").trim();

    const categoryId = String(formData.get("categoryId") ?? "").trim();
    const categoryTypeId = parseNullableString(formData.get("categoryTypeId"));
    const metalTypeId = String(formData.get("metalTypeId") ?? "").trim();
    const stoneOriginOptionId = parseNullableString(
      formData.get("stoneOriginOptionId"),
    );

    const targetStyleId = parseNullableString(formData.get("targetStyleId"));

    const defaultPurity = parseOptionalEnum(
      formData.get("defaultPurity"),
      Object.values(PurityType),
    ) as PurityType | null;

    const storeMetalPurityId = parseNullableString(formData.get("storeMetalPurityId"));

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

    const defaultFinish =
      parseOptionalEnum(
        formData.get("defaultFinish"),
        Object.values(InventoryFinish),
      ) ?? InventoryFinish.KACHA;

    // Typical weights for the design. Required as of the 2026 tightening —
    // every product master now records a real Gross/Net Weight (validated
    // below), even a coin/bar/loose stone previously left blank under the
    // old "sold by count" allowance.
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
    const imageUrls = parseProductImageUrls(formData.get("imageUrlsJson"));
    const isActive = parseBoolean(formData.get("isActive"));

    const errors: Record<string, string[]> = {};

    if (!name) {
      errors.name = ["Product name is required"];
    }

    if (businessSettings?.styleFieldEnabled !== false && !targetStyleId) {
      errors.targetStyleId = ["Style is required"];
    }

    if (defaultGrossWeight === null) {
      errors.defaultGrossWeight = ["Gross weight is required"];
    }

    if (defaultNetWeight === null) {
      errors.defaultNetWeight = ["Net weight is required"];
    }

    // A loose stone's carat weight is derived from its single Net Weight
    // field, so a 0 there means a weightless stone. Stone products only: a
    // metal product submits the sum of its metal rows (0 for an older
    // product with none), and that error has no field to show on — it made
    // Update Product silently do nothing.
    if (
      defaultNetWeight !== null &&
      Number(defaultNetWeight) <= 0 &&
      metalTypeId &&
      (await prisma.storeMetal.findFirst({ where: { id: metalTypeId }, select: { isGemstone: true } }))?.isGemstone
    ) {
      errors.defaultNetWeight = ["Enter the stone's weight — it must be more than 0"];
    }

    Object.assign(
      errors,
      await validateTaxonomySelection(
        storeId,
        categoryId,
        metalTypeId,
        categoryTypeId,
        stoneOriginOptionId,
        targetStyleId,
      ),
    );

    // The metal/stone component repeaters — see their own doc comments.
    // metalTypeId/defaultGrossWeight etc. above already carry the FIRST
    // (primary) component's own values, submitted by the client under
    // those same legacy field names, so every check/lookup above this line
    // is untouched; these two arrays are purely additive, persisted as
    // child rows once the Product itself is created below.
    const { components: metalComponents, error: metalComponentsError } =
      await parseAndValidateMetalComponents(storeId, formData);
    if (metalComponentsError) errors.metalComponentsJson = [metalComponentsError];
    const { components: stoneComponents, error: stoneComponentsError } =
      await parseStoneComponents(storeId, formData);
    if (stoneComponentsError) errors.stoneComponentsJson = [stoneComponentsError];

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
    const [metalRow, categoryTypeRow, categoryRow, styleRow, storeMetalPurityRow] = await Promise.all([
      prisma.storeMetal.findFirst({ where: { id: metalTypeId, storeId }, select: { name: true, isGemstone: true } }),
      categoryTypeId
        ? prisma.storeCategoryType.findFirst({ where: { id: categoryTypeId, storeId }, select: { name: true } })
        : Promise.resolve(null),
      prisma.storeCategory.findFirst({ where: { id: categoryId, storeId }, select: { name: true } }),
      targetStyleId
        ? prisma.storeStyle.findFirst({ where: { id: targetStyleId, storeId }, select: { name: true } })
        : Promise.resolve(null),
      storeMetalPurityId
        ? prisma.storeMetalPurity.findFirst({
            where: { id: storeMetalPurityId, storeId, storeMetalId: metalTypeId },
            select: { label: true, skuCode: true },
          })
        : Promise.resolve(null),
    ]);

    // The new per-Metal Purity's own skuCode/label takes over from here —
    // defaultPurity (the legacy enum) is still populated below on a
    // best-effort basis purely so anything not yet reading the new columns
    // still shows something.
    const resolvedDefaultPurity = storeMetalPurityRow
      ? (matchLegacyPurityType(
          metalRow ? classifyPurityFamily(metalRow) : null,
          storeMetalPurityRow.label,
        ) ?? defaultPurity)
      : defaultPurity;

    const skuPrefix = buildSkuPrefix({
      metalName: metalRow?.name ?? "X",
      purity: resolvedDefaultPurity,
      purityCode: storeMetalPurityRow?.skuCode,
      targetStyleName: styleRow?.name ?? null,
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
            // Blank is legitimate for a stone product (see
            // validateTaxonomySelection) and must be stored as null — an
            // empty string fails Product_categoryId_fkey.
            categoryId: categoryId || null,
            categoryTypeId,
            metalTypeId,
            targetStyleId,
            stoneOriginOptionId,
            defaultPurity: resolvedDefaultPurity,
            storeMetalPurityId,
            defaultMakingCharge,
            defaultMakingChargeType,
            defaultStoneCharge,
            defaultStoneChargeType,
            defaultFinish,
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
            imageUrls,
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

    if (metalComponents.length > 0) {
      await prisma.productMetalComponent.createMany({
        data: metalComponents.map((component, index) => ({
          productId: createdProduct!.id,
          metalTypeId: String(component.metalTypeId),
          storeMetalPurityId: component.storeMetalPurityId || null,
          grossWeight: toNumberOrNull(component.grossWeight),
          netWeight: toNumberOrNull(component.netWeight),
          gstRateId: component.gstRateId || null,
          sortOrder: index,
        })),
      });
    }

    if (stoneComponents.length > 0) {
      await prisma.productStoneComponent.createMany({
        data: stoneComponents.map((component, index) => ({
          productId: createdProduct!.id,
          stoneMetalTypeName: String(component.stoneMetalTypeName),
          stoneTypeNames: component.stoneTypeNames ? String(component.stoneTypeNames) : null,
          caratWeight: toNumberOrNull(component.caratWeight),
          stoneWeight: toNumberOrNull(component.stoneWeight),
          stoneRate: toNumberOrNull(component.stoneRate),
          stoneCharge: toNumberOrNull(component.stoneCharge),
          stoneChargeType: toChargeTypeInput(component.stoneChargeType),
          clarity: component.clarity ? String(component.clarity).trim() || null : null,
          certificateNumber: component.certificateNumber ? String(component.certificateNumber).trim() || null : null,
          pieces: toPiecesOrNull(component.pieces),
          gstRateId: component.gstRateId || null,
          sortOrder: index,
        })),
      });
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
              finish: defaultFinish,
              locationId: resolvedLocationId,
              metalTypeId: metalTypeId || null,
              purity: resolvedDefaultPurity,
              purityLabel: storeMetalPurityRow?.label ?? null,
              makingCharge: defaultMakingCharge,
              makingChargeType: defaultMakingChargeType,
              stoneCharge: defaultStoneCharge,
              // Seeded from the product so the piece is weighed once. The
              // stock row stays the per-piece record and can be corrected
              // against the scale without touching the design.
              grossWeight: defaultGrossWeight,
              netWeight: defaultNetWeight,
              ...(await getFineWeightResolver(storeId)).line({
                metalTypeId: metalTypeId || null,
                purityLabel: storeMetalPurityRow?.label ?? null,
                purity: resolvedDefaultPurity,
                netWeight: defaultNetWeight,
                grossWeight: defaultGrossWeight,
              }),
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

    const targetStyleId = parseNullableString(formData.get("targetStyleId"));

    const defaultPurity = parseOptionalEnum(
      formData.get("defaultPurity"),
      Object.values(PurityType),
    ) as PurityType | null;
    const storeMetalPurityId = parseNullableString(formData.get("storeMetalPurityId"));
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

    const defaultFinish =
      parseOptionalEnum(
        formData.get("defaultFinish"),
        Object.values(InventoryFinish),
      ) ?? InventoryFinish.KACHA;

    // Typical weights for the design. Required as of the 2026 tightening —
    // every product master now records a real Gross/Net Weight (validated
    // below), even a coin/bar/loose stone previously left blank under the
    // old "sold by count" allowance.
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
    const imageUrls = parseProductImageUrls(formData.get("imageUrlsJson"));
    const isActive = parseBoolean(formData.get("isActive"));

    const errors: Record<string, string[]> = {};

    if (!name) {
      errors.name = ["Product name is required"];
    }

    if (defaultGrossWeight === null) {
      errors.defaultGrossWeight = ["Gross weight is required"];
    }

    if (defaultNetWeight === null) {
      errors.defaultNetWeight = ["Net weight is required"];
    }

    // A loose stone's carat weight is derived from its single Net Weight
    // field, so a 0 there means a weightless stone. Stone products only: a
    // metal product submits the sum of its metal rows (0 for an older
    // product with none), and that error has no field to show on — it made
    // Update Product silently do nothing.
    if (
      defaultNetWeight !== null &&
      Number(defaultNetWeight) <= 0 &&
      metalTypeId &&
      (await prisma.storeMetal.findFirst({ where: { id: metalTypeId }, select: { isGemstone: true } }))?.isGemstone
    ) {
      errors.defaultNetWeight = ["Enter the stone's weight — it must be more than 0"];
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
        targetStyleId,
      ),
    );

    // See createProduct's identical comment — these arrays are purely
    // additive alongside the legacy metalTypeId/defaultGrossWeight etc.
    // fields above, which already carry the first component's own values.
    const { components: metalComponents, error: metalComponentsError } =
      await parseAndValidateMetalComponents(storeId, formData);
    if (metalComponentsError) errors.metalComponentsJson = [metalComponentsError];
    const { components: stoneComponents, error: stoneComponentsError } =
      await parseStoneComponents(storeId, formData);
    if (stoneComponentsError) errors.stoneComponentsJson = [stoneComponentsError];

    if (Object.keys(errors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors,
      };
    }

    const [metalRow, storeMetalPurityRow] = await Promise.all([
      metalTypeId
        ? prisma.storeMetal.findFirst({ where: { id: metalTypeId, storeId }, select: { name: true, isGemstone: true } })
        : Promise.resolve(null),
      storeMetalPurityId
        ? prisma.storeMetalPurity.findFirst({
            where: { id: storeMetalPurityId, storeId, storeMetalId: metalTypeId },
            select: { label: true },
          })
        : Promise.resolve(null),
    ]);

    const resolvedDefaultPurity = storeMetalPurityRow
      ? (matchLegacyPurityType(metalRow ? classifyPurityFamily(metalRow) : null, storeMetalPurityRow.label) ?? defaultPurity)
      : defaultPurity;

   // Same replace-on-update pattern as PurchaseItem (lib/actions/
   // purchase-actions.ts) — drop every old component row and recreate from
   // the submitted arrays, inside the same transaction as the Product row
   // update itself so a failure partway through never leaves the two out
   // of sync.
   const { count } = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.updateMany({
      where: { id, storeId },
      data: {
        name,
        // Blank → null, see createProduct.
        categoryId: categoryId || null,
        categoryTypeId,
        metalTypeId,
        targetStyleId,
        stoneOriginOptionId,
        defaultPurity: resolvedDefaultPurity,
        storeMetalPurityId,
        defaultMakingCharge,
        defaultMakingChargeType,
        defaultStoneCharge,
        defaultStoneChargeType,
        defaultFinish,
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
        imageUrls,
        isActive,
      },
    })

    if (updated.count === 0) return updated

    await tx.productMetalComponent.deleteMany({ where: { productId: id } })
    if (metalComponents.length > 0) {
      await tx.productMetalComponent.createMany({
        data: metalComponents.map((component, index) => ({
          productId: id,
          metalTypeId: String(component.metalTypeId),
          storeMetalPurityId: component.storeMetalPurityId || null,
          grossWeight: toNumberOrNull(component.grossWeight),
          netWeight: toNumberOrNull(component.netWeight),
          gstRateId: component.gstRateId || null,
          sortOrder: index,
        })),
      })
    }

    await tx.productStoneComponent.deleteMany({ where: { productId: id } })
    if (stoneComponents.length > 0) {
      await tx.productStoneComponent.createMany({
        data: stoneComponents.map((component, index) => ({
          productId: id,
          stoneMetalTypeName: String(component.stoneMetalTypeName),
          stoneTypeNames: component.stoneTypeNames ? String(component.stoneTypeNames) : null,
          caratWeight: toNumberOrNull(component.caratWeight),
          stoneWeight: toNumberOrNull(component.stoneWeight),
          stoneRate: toNumberOrNull(component.stoneRate),
          stoneCharge: toNumberOrNull(component.stoneCharge),
          stoneChargeType: toChargeTypeInput(component.stoneChargeType),
          clarity: component.clarity ? String(component.clarity).trim() || null : null,
          certificateNumber: component.certificateNumber ? String(component.certificateNumber).trim() || null : null,
          pieces: toPiecesOrNull(component.pieces),
          gstRateId: component.gstRateId || null,
          sortOrder: index,
        })),
      })
    }

    return updated
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

/**
 * Marks every selected product Inactive in one go — the bulk counterpart
 * to disableProduct's own single-row toggle. Unlike bulkDeleteProducts,
 * this never fails per-item: deactivating carries none of hard-delete's
 * dependency risk (linked stock/invoice/karigar-job history is untouched
 * and stays fully intact), so a product with real transaction history —
 * which blocks deletion — can still always be archived this way instead.
 */
export async function bulkArchiveProducts(ids: string[]): Promise<{ count: number }> {
  const storeId = await requireStoreScope();

  const { count } = await prisma.product.updateMany({
    where: { id: { in: ids }, storeId },
    data: { isActive: false },
  });

  revalidatePath("/inventory/products");
  revalidatePath("/inventory/products/archived");

  return { count };
}

/** Marks every selected product Active again in one go — the bulk
 * counterpart to enableProduct's own single-row toggle, for the Archived
 * Products page. */
export async function bulkUnarchiveProducts(ids: string[]): Promise<{ count: number }> {
  const storeId = await requireStoreScope();

  const { count } = await prisma.product.updateMany({
    where: { id: { in: ids }, storeId },
    data: { isActive: true },
  });

  revalidatePath("/inventory/products");
  revalidatePath("/inventory/products/archived");

  return { count };
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
 * like the single "Add Product" form generates it. Stock Quantity/Location
 * are the bulk equivalent of "Add Product"'s own "create a stock entry too"
 * checkbox — leave Stock Quantity blank to import the product alone.
 */
const PRODUCT_SHEET_NOTES = [
  "How to fill in the Products sheet",
  "• One row per product. Replace or delete the example rows before importing.",
  "• Several metals or stones in one product (e.g. Gold + Silver with Diamond + Ruby): put the first metal and first stone on the product's row,",
  "   then add a row below it with Product Name left BLANK for each extra metal and/or stone — fill only the metal columns (Metal Type, Purity,",
  "   Gross Weight, Metal GST Rate) and/or the stone columns (Stone Metal Type Name through Stone Weight) on those rows. Exports use the same layout.",
  "• Columns can be in any order — they are matched by their header names, so don't rename the headers.",
  "• Dropdowns list your store's own names (from Settings). The Options sheet shows every list.",
  "• Nothing is imported if any row has an error — the import lists each problem with its row number.",
  "• A Products export has these same columns, so an exported file can be edited and imported as new products.",
]

/** The template/export dropdown lists, from this store's own masters. */
async function loadProductSheetDropdowns(storeId: string): Promise<Record<string, string[]>> {
  const [metals, categories, categoryTypes, styles, origins, locations, purities, gstRates, clarities] = await Promise.all([
    prisma.storeMetal.findMany({ where: { storeId, isActive: true }, select: { name: true, isGemstone: true }, orderBy: { name: "asc" } }),
    prisma.storeCategory.findMany({ where: { storeId, isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.storeCategoryType.findMany({ where: { storeId, isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.storeStyle.findMany({ where: { storeId, isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.storeMetalOrigin.findMany({ where: { storeId, isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.storeLocation.findMany({ where: { storeId, isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.storeMetalPurity.findMany({ where: { storeId, isActive: true }, select: { label: true }, orderBy: [{ storeMetalId: "asc" }, { sortOrder: "asc" }] }),
    prisma.gstRate.findMany({ where: { storeId, isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.storeStoneClarity.findMany({ where: { storeId, isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const names = (rows: { name: string }[]) => rows.map((row) => row.name);
  const yesNo = ["Yes", "No"];
  const chargeTypes = ["Fixed", "Percentage"];

  return {
    "Metal Type": names(metals),
    Category: names(categories),
    "Category Type": names(categoryTypes),
    Style: names(styles),
    "Stone Type": names(origins),
    Purity: purities.map((purity) => purity.label),
    "Metal GST Rate": names(gstRates),
    "Has Stone Component": yesNo,
    "Stone Metal Type Name": names(metals.filter((metal) => metal.isGemstone)),
    "Stone Type Names": names(origins),
    "Stone Charge Type": chargeTypes,
    "Stone Clarity": names(clarities),
    "Stone GST Rate": names(gstRates),
    "Making Charge Type": chargeTypes,
    Active: yesNo,
    Finish: ["Unfinished", "Finished / Hallmarked"],
    Location: names(locations),
  };
}

export async function getProductImportTemplate(): Promise<{
  fileName: string;
  fileBase64: string;
}> {
  const storeId = await requireStoreScope();
  const features = await getSheetFeatures(storeId);
  const headers = productSheetHeaders(features);
  const example = Object.fromEntries(productSheetColumns(features).map((column) => [column.header, column.example]));

  return buildImportTemplateWithDropdowns({
    sheetName: "Products Import",
    rows: [example, pickSheetRow(PRODUCT_SHEET_FOLLOW_ON_EXAMPLE, headers)],
    columns: headers,
    dropdowns: dropdownsFor(await loadProductSheetDropdowns(storeId), headers),
    instructions: { notes: PRODUCT_SHEET_NOTES, rows: productSheetInstructions(features) },
    filePrefix: "products-import-template",
  });
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

    // A column this store's sheets leave out (Style while it's switched off,
    // GST Rate / Location with no such master) is ignored if an older file
    // still has it — read as blank, never an error, never written.
    const rows = stripHiddenSheetColumns(
      parseExcelUpload(await file.arrayBuffer()),
      hiddenSheetHeaders(PRODUCT_SHEET_COLUMNS, await getSheetFeatures(storeId)),
    );

    if (!rows.length) {
      return { success: false, message: "That file has no rows to import." };
    }

    const [categories, metals, categoryTypes, metalOrigins, locations, styles, businessSettings, storePurities, gstRates] = await Promise.all([
      prisma.storeCategory.findMany({ where: { storeId }, select: { id: true, name: true } }),
      prisma.storeMetal.findMany({ where: { storeId }, select: { id: true, name: true, isGemstone: true } }),
      prisma.storeCategoryType.findMany({
        where: { storeId },
        select: { id: true, name: true, categoryId: true },
      }),
      prisma.storeMetalOrigin.findMany({
        where: { storeId },
        select: { id: true, name: true, storeMetalId: true },
      }),
      prisma.storeLocation.findMany({ where: { storeId }, select: { id: true, name: true } }),
      prisma.storeStyle.findMany({ where: { storeId }, select: { id: true, name: true } }),
      prisma.businessSettings.findUnique({ where: { storeId }, select: { skuFormat: true, styleFieldEnabled: true } }),
      prisma.storeMetalPurity.findMany({ where: { storeId }, select: { id: true, label: true, skuCode: true, storeMetalId: true } }),
      prisma.gstRate.findMany({ where: { storeId }, select: { id: true, name: true } }),
    ]);

    const categoryByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]));
    const metalByName = new Map(metals.map((m) => [m.name.trim().toLowerCase(), m]));
    const locationByName = new Map(locations.map((l) => [l.name.trim().toLowerCase(), l.id]));
    const styleByName = new Map(styles.map((s) => [s.name.trim().toLowerCase(), s]));
    const locationScope = await getLocationScope();
    const metalCandidates = namesAsCandidates(metals.map((m) => m.name));

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

    // The store's own purities (Settings › Purity), per metal — what the Add
    // Product form offers. The generic labels below stay accepted for older
    // sheets.
    const storePuritiesByMetal = new Map<string, Map<string, (typeof storePurities)[number]>>();
    for (const purity of storePurities) {
      if (!storePuritiesByMetal.has(purity.storeMetalId)) storePuritiesByMetal.set(purity.storeMetalId, new Map());
      storePuritiesByMetal.get(purity.storeMetalId)!.set(purity.label.trim().toLowerCase(), purity);
    }
    const gstRateByName = new Map(gstRates.map((rate) => [rate.name.trim().toLowerCase(), rate]));
    const gstRateCell = (row: Record<string, unknown>, column: string, rowErrors: string[]) => {
      const raw = productImportCell(row, column);
      if (!raw) return null;
      const rate = gstRateByName.get(raw.toLowerCase());
      if (!rate) rowErrors.push(`No GST rate found named "${raw}" (${column})${suggestFrom(raw, namesAsCandidates(gstRates.map((r) => r.name)))}`);
      return rate?.id ?? null;
    };

    const purityByLabel = new Map(
      (Object.entries(PURITY_LABELS) as [PurityType, string][]).map(([value, label]) => [
        label.toLowerCase(),
        value,
      ]),
    );
    type MetalComponentInput = Omit<Prisma.ProductMetalComponentCreateManyInput, "productId">;
    type StoneComponentInput = Omit<Prisma.ProductStoneComponentCreateManyInput, "productId">;

    /** A metal's own Settings › Purity label first, else an older generic label. */
    const resolvePurity = (
      metalRow: (typeof metals)[number],
      raw: string,
      rowErrors: string[],
    ): { storePurity?: (typeof storePurities)[number]; legacy: PurityType | null } => {
      if (!raw) return { legacy: null };
      const storePurity = storePuritiesByMetal.get(metalRow.id)?.get(raw.toLowerCase());
      if (storePurity) {
        return { storePurity, legacy: matchLegacyPurityType(classifyPurityFamily(metalRow), storePurity.label) };
      }
      const legacy = purityByLabel.get(raw.toLowerCase());
      if (!legacy) {
        const storeLabels = storePurities.filter((p) => p.storeMetalId === metalRow.id).map((p) => p.label);
        rowErrors.push(
          `"${raw}" is not a purity of ${metalRow.name}${suggestFrom(raw, namesAsCandidates(storeLabels.length ? storeLabels : Object.values(PURITY_LABELS)))}`,
        );
      }
      return { legacy: legacy ?? null };
    };

    /** One stone's columns (Stone through Stone Weight); null when the row names no stone. */
    const stoneFromRow = (row: Record<string, unknown>, rowErrors: string[]): StoneComponentInput | null => {
      const stoneName = productImportCell(row, "Stone Metal Type Name");
      if (!stoneName) return null;
      const numbers: Record<string, number | null> = {};
      for (const key of ["Carat Weight", "Stone Rate", "Stone Charge", "Stone Weight"]) {
        const { value, error } = productImportDecimal(row, key);
        if (error) rowErrors.push(error);
        numbers[key] = value;
      }
      const chargeTypeRaw = productImportCell(row, "Stone Charge Type");
      const chargeType = chargeTypeRaw ? CHARGE_TYPE_LABELS[chargeTypeRaw.toLowerCase()] : ChargeType.FIXED;
      if (!chargeType) rowErrors.push(`"${chargeTypeRaw}" is not a valid Stone Charge Type — use Fixed or Percentage`);
      const rawPieces = productImportCell(row, "Stone Pcs");
      let pieces: number | null = null;
      if (rawPieces) {
        const parsed = Number(rawPieces);
        if (!Number.isInteger(parsed) || parsed < 0) rowErrors.push("Stone Pcs must be a whole number");
        else pieces = parsed;
      }
      return {
        stoneMetalTypeName: stoneName,
        stoneTypeNames: productImportCell(row, "Stone Type Names") || null,
        caratWeight: numbers["Carat Weight"],
        stoneWeight: numbers["Stone Weight"],
        stoneRate: numbers["Stone Rate"],
        stoneCharge: numbers["Stone Charge"],
        stoneChargeType: chargeType ?? ChargeType.FIXED,
        clarity: productImportCell(row, "Stone Clarity") || null,
        certificateNumber: productImportCell(row, "IGI Certificate No.") || null,
        pieces,
        gstRateId: gstRateCell(row, "Stone GST Rate", rowErrors),
        sortOrder: 0,
      };
    };

    // A row with a blank Product Name continues the product above it: it
    // adds one more metal and/or one more stone (the Add Product form's
    // "Add metal" / "Add stone"). Every other column on such a row is ignored.
    const groups: { line: number; row: Record<string, unknown>; extras: { line: number; row: Record<string, unknown> }[] }[] = [];
    const groupingErrors: string[] = [];
    for (const [index, row] of rows.entries()) {
      // +2 = one for the header row, one for 1-based spreadsheet numbering.
      const line = index + 2;
      if (productImportCell(row, "Product Name")) {
        groups.push({ line, row, extras: [] });
      } else if (productImportCell(row, "Metal Type") || productImportCell(row, "Stone Metal Type Name")) {
        const current = groups[groups.length - 1];
        if (current) current.extras.push({ line, row });
        else groupingErrors.push(`Row ${line}: Product Name is required (a row without one adds a metal/stone to the product above, but there is none)`);
      }
    }

    type ResolvedRow = {
      skuPrefix: string;
      fields: Omit<Prisma.ProductCreateManyInput, "storeId" | "productCode">;
      /** The bulk equivalent of "Add Product"'s own "create a stock entry
       * too" checkbox — null means this row is product-only. */
      stockQuantity: number | null;
      stockLocationId: string | null;
      /** Store purity label, carried onto the opening stock entry. */
      purityLabel: string | null;
      /** The per-metal / per-stone rows the Add Product form also saves. */
      metalComponents: MetalComponentInput[];
      stoneComponents: StoneComponentInput[];
    };

    const errors: string[] = [...groupingErrors];
    const resolvedRows: ResolvedRow[] = [];

    for (const { line, row, extras } of groups) {
      const rowErrors: string[] = [];

      const name = productImportCell(row, "Product Name");
      if (!name) rowErrors.push("Product Name is required");

      const categoryName = productImportCell(row, "Category");
      const category = categoryName ? categoryByName.get(categoryName.toLowerCase()) : undefined;
      if (!categoryName) rowErrors.push("Category is required");
      else if (!category) rowErrors.push(`No category found named "${categoryName}"${suggestFrom(categoryName, namesAsCandidates(categories.map((c) => c.name)))}`);

      const metalName = productImportCell(row, "Metal Type");
      const metal = metalName ? metalByName.get(metalName.toLowerCase()) : undefined;
      if (!metalName) rowErrors.push("Metal Type is required");
      else if (!metal) rowErrors.push(`No metal type found named "${metalName}"${suggestFrom(metalName, metalCandidates)}`);

      const styleRaw = productImportCell(row, "Style");
      const style = styleRaw ? styleByName.get(styleRaw.toLowerCase()) : undefined;
      if (!styleRaw) {
        if (businessSettings?.styleFieldEnabled !== false) rowErrors.push("Style is required");
      } else if (!style) {
        rowErrors.push(`No style found named "${styleRaw}"${suggestFrom(styleRaw, namesAsCandidates(styles.map((st) => st.name)))}`);
      }

      const categoryTypeName = productImportCell(row, "Category Type");
      let categoryType: { id: string; name: string } | undefined;
      if (categoryTypeName && category) {
        categoryType = categoryTypesByCategory.get(category.id)?.get(categoryTypeName.toLowerCase());
        if (!categoryType) {
          rowErrors.push(
            `Category Type "${categoryTypeName}" does not belong to category "${categoryName}"${suggestFrom(
              categoryTypeName,
              namesAsCandidates([...(categoryTypesByCategory.get(category.id)?.values() ?? [])].map((t) => t.name)),
            )}`,
          );
        }
      }

      const stoneTypeName = productImportCell(row, "Stone Type");
      let stoneOrigin: { id: string; name: string } | undefined;
      if (stoneTypeName && metal) {
        stoneOrigin = metalOriginsByMetal.get(metal.id)?.get(stoneTypeName.toLowerCase());
        if (!stoneOrigin) {
          rowErrors.push(
            `Stone Type "${stoneTypeName}" does not belong to metal type "${metalName}"${suggestFrom(
              stoneTypeName,
              namesAsCandidates([...(metalOriginsByMetal.get(metal.id)?.values() ?? [])].map((o) => o.name)),
            )}`,
          );
        }
      }

      const purityRaw = productImportCell(row, "Purity");
      const { storePurity, legacy: defaultPurity } = metal
        ? resolvePurity(metal, purityRaw, rowErrors)
        : { storePurity: undefined, legacy: null };
      const metalGstRateId = gstRateCell(row, "Metal GST Rate", rowErrors);

      // This row's stone, then one more metal/stone per continuation row.
      const stones: StoneComponentInput[] = [];
      const mainStone = stoneFromRow(row, rowErrors);
      if (mainStone) stones.push(mainStone);
      const extraMetals: MetalComponentInput[] = [];
      for (const extra of extras) {
        const extraErrors: string[] = [];
        const extraMetalName = productImportCell(extra.row, "Metal Type");
        if (extraMetalName) {
          const extraMetal = metalByName.get(extraMetalName.toLowerCase());
          if (!extraMetal) extraErrors.push(`No metal type found named "${extraMetalName}"${suggestFrom(extraMetalName, metalCandidates)}`);
          else if (extraMetal.isGemstone || metal?.isGemstone) {
            extraErrors.push(`"${extraMetalName}": extra metal rows are for metal products — put a stone in the Stone column instead`);
          } else {
            const extraPurity = resolvePurity(extraMetal, productImportCell(extra.row, "Purity"), extraErrors);
            const { value: extraGross, error: grossError } = productImportDecimal(extra.row, "Gross Weight");
            if (grossError) extraErrors.push(grossError);
            else if (extraGross === null) extraErrors.push(`Gross Weight is required for ${extraMetal.name}`);
            extraMetals.push({
              metalTypeId: extraMetal.id,
              storeMetalPurityId: extraPurity.storePurity?.id ?? null,
              grossWeight: extraGross,
              // Same as the form: each metal row mirrors its own gross; the
              // product's Net Weight stays the authoritative total.
              netWeight: extraGross,
              gstRateId: gstRateCell(extra.row, "Metal GST Rate", extraErrors),
              sortOrder: 0,
            });
          }
        }
        const extraStone = stoneFromRow(extra.row, extraErrors);
        if (extraStone) stones.push(extraStone);
        for (const message of extraErrors) errors.push(`Row ${extra.line}: ${message}`);
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

      const finishRaw = productImportCell(row, "Finish");
      let defaultFinish: InventoryFinish = InventoryFinish.KACHA;
      if (finishRaw) {
        const matched = parseFinishLabel(finishRaw);
        if (!matched) {
          rowErrors.push(`"${finishRaw}" is not a valid Finish — use Unfinished or Finished`);
        } else {
          defaultFinish = matched;
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

      // Required as of the 2026 tightening — same rule the single "Add
      // Product"/"Edit Product" form now enforces, so a bulk import can't
      // slip a product past it with a blank weight column.
      if (numericFields["Gross Weight"] === null) rowErrors.push("Gross Weight is required");
      if (numericFields["Net Weight"] === null) rowErrors.push("Net Weight is required");

      // The bulk equivalent of "Add Product"'s own "create a stock entry
      // too" checkbox — blank Stock Quantity means this row is product-only,
      // matching the single form's opt-in default.
      const rawStockQuantity = productImportCell(row, "Stock Quantity");
      let stockQuantity: number | null = null;
      if (rawStockQuantity !== "") {
        const parsed = Number(rawStockQuantity);
        if (!Number.isFinite(parsed) || parsed < 0) {
          rowErrors.push("Stock Quantity must be 0 or more");
        } else {
          stockQuantity = Math.trunc(parsed);
        }
      }

      let stockLocationId: string | null = null;
      if (stockQuantity !== null) {
        const locationName = productImportCell(row, "Location");
        const requestedLocationId = locationName
          ? (locationByName.get(locationName.toLowerCase()) ?? null)
          : null;

        if (locationName && !requestedLocationId) {
          rowErrors.push(`No location found named "${locationName}"${suggestFrom(locationName, namesAsCandidates(locations.map((l) => l.name)))}`);
        } else {
          const resolution = await resolveWritableLocationId(storeId, requestedLocationId, locationScope);
          if (!resolution.ok) {
            rowErrors.push(resolution.message);
          } else {
            stockLocationId = resolution.locationId;
          }
        }
      }

      if (rowErrors.length > 0) {
        for (const message of rowErrors) errors.push(`Row ${line}: ${message}`);
        continue;
      }

      // Every check above passed, so category/metal are guaranteed non-null
      // here even though TypeScript can't tell from the control flow alone.
      // style stays possibly-undefined on purpose — a missing Style only
      // reached here without a row error when the store has turned the
      // Style field off (styleFieldEnabled === false).
      const resolvedCategory = category!;
      const resolvedMetal = metal!;
      const resolvedStyle = style;
      const hasStoneComponent = productImportYesNo(row, "Has Stone Component", false);
      const isActive = productImportYesNo(row, "Active", true);

      const skuPrefix = buildSkuPrefix({
        metalName: resolvedMetal.name,
        purity: defaultPurity,
        purityCode: storePurity?.skuCode,
        targetStyleName: resolvedStyle?.name ?? null,
        categoryTypeName: categoryType?.name ?? null,
        categoryName: resolvedCategory.name,
        format: businessSettings?.skuFormat,
      });

      // Product-level summary, the same way the Add Product form derives it:
      // the first metal/stone is primary, stone weight and charge are summed,
      // stone types are joined across stones.
      const isMetalProduct = !resolvedMetal.isGemstone;
      const stoneSummary = isMetalProduct && stones.length > 0;
      const sum = (values: (number | null | undefined)[]) =>
        values.some((value) => value != null) ? values.reduce<number>((total, value) => total + (value ?? 0), 0) : null;
      const primaryStone = stones[0];
      const metalComponents: MetalComponentInput[] = [
        {
          metalTypeId: resolvedMetal.id,
          storeMetalPurityId: isMetalProduct ? (storePurity?.id ?? null) : null,
          grossWeight: numericFields["Gross Weight"],
          netWeight: isMetalProduct ? numericFields["Gross Weight"] : numericFields["Net Weight"],
          gstRateId: isMetalProduct ? metalGstRateId : null,
          sortOrder: 0,
        },
        ...extraMetals,
      ].map((component, index) => ({ ...component, sortOrder: index }));
      const stoneComponents = stones.map((component, index) => ({ ...component, sortOrder: index }));

      resolvedRows.push({
        skuPrefix,
        stockQuantity,
        stockLocationId,
        purityLabel: storePurity?.label ?? null,
        metalComponents,
        stoneComponents,
        fields: {
          name,
          categoryId: resolvedCategory.id,
          categoryTypeId: categoryType?.id ?? null,
          metalTypeId: resolvedMetal.id,
          targetStyleId: resolvedStyle?.id ?? null,
          stoneOriginOptionId: stoneOrigin?.id ?? null,
          defaultPurity,
          storeMetalPurityId: storePurity?.id ?? null,
          defaultMakingCharge: numericFields["Making Charge"],
          defaultMakingChargeType,
          defaultStoneCharge: stoneSummary ? sum(stones.map((stone) => stone.stoneCharge as number | null)) : numericFields["Stone Charge"],
          defaultStoneChargeType,
          defaultFinish,
          defaultGrossWeight: numericFields["Gross Weight"],
          defaultNetWeight: numericFields["Net Weight"],
          defaultStoneWeight: stoneSummary ? sum(stones.map((stone) => stone.stoneWeight as number | null)) : numericFields["Stone Weight"],
          defaultCaratWeight: stoneSummary ? ((primaryStone.caratWeight as number | null) ?? null) : numericFields["Carat Weight"],
          hasStoneComponent: isMetalProduct && (hasStoneComponent || stones.length > 0),
          defaultStoneRate: stoneSummary ? ((primaryStone.stoneRate as number | null) ?? null) : null,
          defaultStoneMetalTypeName: stoneSummary ? primaryStone.stoneMetalTypeName : null,
          defaultStoneTypeNames: stoneSummary
            ? stones.map((stone) => stone.stoneTypeNames).filter(Boolean).join(",") || null
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

    const toCreate: (Prisma.ProductCreateManyInput & {
      stockQuantity: number | null;
      stockLocationId: string | null;
      purityLabel: string | null;
      metalComponents: MetalComponentInput[];
      stoneComponents: StoneComponentInput[];
    })[] = resolvedRows.map((row) => {
      const nextSeq = (highestSeqByPrefix.get(row.skuPrefix) ?? 0) + 1;
      highestSeqByPrefix.set(row.skuPrefix, nextSeq);
      return {
        storeId,
        productCode: `${row.skuPrefix}-${String(nextSeq).padStart(3, "0")}`,
        stockQuantity: row.stockQuantity,
        stockLocationId: row.stockLocationId,
        purityLabel: row.purityLabel,
        metalComponents: row.metalComponents,
        stoneComponents: row.stoneComponents,
        ...row.fields,
      };
    });

    // createManyAndReturn (not plain createMany) because a row that also
    // asked for a stock entry needs this product's generated id to link
    // InventoryStock.productId — matched back by productCode rather than by
    // trusting the returned rows' order, which Prisma doesn't guarantee
    // matches the input array's order.
    const createdProducts = await prisma.product.createManyAndReturn({
      data: toCreate.map(
        ({ stockQuantity, stockLocationId, purityLabel, metalComponents, stoneComponents, ...productData }) => productData,
      ),
      select: { id: true, productCode: true },
    });
    const productIdByCode = new Map(createdProducts.map((p) => [p.productCode, p.id]));

    const metalComponentRows = toCreate.flatMap((row) =>
      row.metalComponents.map((component) => ({ ...component, productId: productIdByCode.get(row.productCode)! })),
    );
    const stoneComponentRows = toCreate.flatMap((row) =>
      row.stoneComponents.map((component) => ({ ...component, productId: productIdByCode.get(row.productCode)! })),
    );
    if (metalComponentRows.length) await prisma.productMetalComponent.createMany({ data: metalComponentRows });
    if (stoneComponentRows.length) await prisma.productStoneComponent.createMany({ data: stoneComponentRows });

    const rowsWantingStock = toCreate.filter((row) => row.stockQuantity !== null);
    let stockCreatedCount = 0;

    if (rowsWantingStock.length) {
      const existingStockCodes = await prisma.inventoryStock.findMany({
        where: { storeId, stockCode: { startsWith: "STK-" } },
        select: { stockCode: true },
      });
      let highestStockSeq = existingStockCodes.reduce((max, row) => {
        const match = /^STK-(?:\d{4}-)?(\d+)$/.exec(row.stockCode);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0);
      const year = new Date().getFullYear();

      const fineOf = await getFineWeightResolver(storeId);
      const stockToCreate: Prisma.InventoryStockCreateManyInput[] = rowsWantingStock.map((row) => {
        highestStockSeq += 1;
        return {
          storeId,
          productId: productIdByCode.get(row.productCode)!,
          stockCode: `STK-${year}-${String(highestStockSeq).padStart(4, "0")}`,
          quantity: row.stockQuantity!,
          finish: row.defaultFinish,
          locationId: row.stockLocationId,
          metalTypeId: row.metalTypeId,
          purity: row.defaultPurity,
          purityLabel: row.purityLabel,
          makingCharge: row.defaultMakingCharge,
          makingChargeType: row.defaultMakingChargeType,
          stoneCharge: row.defaultStoneCharge,
          grossWeight: row.defaultGrossWeight,
          netWeight: row.defaultNetWeight,
          ...fineOf.line({
            metalTypeId: row.metalTypeId,
            purity: row.defaultPurity,
            purityLabel: row.purityLabel,
            netWeight: row.defaultNetWeight == null ? null : Number(row.defaultNetWeight),
            grossWeight: row.defaultGrossWeight == null ? null : Number(row.defaultGrossWeight),
          }),
          stoneWeight: row.defaultStoneWeight,
          caratWeight: row.defaultCaratWeight,
          stoneRate: row.defaultStoneRate,
          stoneMetalTypeName: row.defaultStoneMetalTypeName,
          stoneTypeNames: row.defaultStoneTypeNames,
        };
      });

      await prisma.inventoryStock.createMany({ data: stockToCreate });
      stockCreatedCount = stockToCreate.length;
    }

    revalidatePath("/inventory");
    revalidatePath("/inventory/products");
    if (stockCreatedCount) revalidatePath("/inventory/stock");

    const productLabel = `${toCreate.length} ${toCreate.length === 1 ? "product" : "products"}`;
    const message = stockCreatedCount
      ? `Added ${productLabel}, with ${stockCreatedCount} stock ${stockCreatedCount === 1 ? "entry" : "entries"}.`
      : `Added ${productLabel}.`;

    return {
      success: true,
      message,
      createdCount: toCreate.length,
    };
  } catch (error) {
    logger.error("importProductsFromExcel error", error);
    return { success: false, message: actionErrorMessage(error, "Failed to import products.") };
  }
}
