// lib/actions/inventory/stock-actions.ts
"use server"

import { randomUUID } from "node:crypto"

import { revalidatePath } from "next/cache"
import {
  InventoryStockStatus,
  InventoryFinish,
  PurityType,
  ChargeType,
  Prisma,
  LedgerEntryType,
  LedgerSourceType,
} from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/auth"
import { requireStoreScope, getStoreIdForRead } from "@/lib/store-context"
import { actionErrorMessage } from "@/lib/action-error";
import {
  getLocationScope,
  locationWhere,
  isLocationAllowed,
  resolveWritableLocationId,
  type LocationScope,
} from "@/lib/location-scope"
import type { StockFormState } from "@/lib/inventory/stock-types"
import { finishLabel, parseFinishLabel } from "@/lib/inventory/finish"
import {
  buildCsvExportBase64,
  buildPdfExportBase64,
  buildImportTemplateWithDropdowns,
  parseExcelUpload,
} from "@/lib/excel-export"
import {
  IMPORTABLE_STOCK_STATUSES,
  STOCK_SHEET_COLUMNS,
  STOCK_SHEET_NOTES,
  STOCK_STATUS_LABELS,
  formatSheetDate,
  parseImportStockStatus,
  parseSheetDate,
  stockSheetColumns,
  stockSheetHeaders,
  stockSheetInstructions,
} from "@/lib/inventory/stock-sheet"
import { dropdownsFor, hiddenSheetHeaders, pickSheetRow, stripHiddenSheetColumns } from "@/lib/sheet-features"
import { getSheetFeatures } from "@/lib/sheet-features.server"
import { PURITY_LABELS } from "@/lib/purity"
import { UNASSIGNED_METAL_TYPE } from "@/lib/business-units"
import { getFineWeightResolver, resolveFineWeight } from "@/lib/fine-weight"
import { describePieceComponentsText, METALS_AND_STONES_COLUMN } from "@/lib/piece-components-text"
import { formatShortDate, formatShortDateTime } from "@/lib/utils"
import { logger } from "@/lib/logger";
import { isProportionalStockSplit, newStockPieceRows, resplitStockPieceRows } from "@/lib/inventory/stock-piece-rows"
import { stockOptionProductDetailsSelect } from "@/lib/inventory/stock-option-details"
import {
  existingRecordHint,
  IMPORT_SUGGESTION_MARK,
  namesAsCandidates,
  suggestFrom,
} from "@/lib/import-suggest";
import { parseDateRangeBoundary } from "@/lib/date-range";

function parseNullableString(value: FormDataEntryValue | null) {
  const parsed = String(value || "").trim()
  return parsed.length ? parsed : null
}

function parseOptionalNumber(value: FormDataEntryValue | null) {
  const parsed = String(value || "").trim()
  if (!parsed) return null

  const num = Number(parsed)
  return Number.isNaN(num) ? null : num
}

function parseOptionalInt(value: FormDataEntryValue | null) {
  const parsed = String(value || "").trim()
  if (!parsed) return null

  const num = Number(parsed)
  if (Number.isNaN(num)) return null
  return Math.trunc(num)
}

function parseOptionalEnum<T extends string>(
  value: FormDataEntryValue | null,
  allowed: readonly T[]
): T | null {
  const parsed = String(value || "").trim()
  if (!parsed) return null
  return allowed.includes(parsed as T) ? (parsed as T) : null
}

// Don't trust the client's toggle state blindly — anything other than an
// exact "PERCENTAGE" match falls back to FIXED, same default as the schema
// column.
function parseChargeType(value: FormDataEntryValue | null): ChargeType {
  return String(value || "").trim() === ChargeType.PERCENTAGE
    ? ChargeType.PERCENTAGE
    : ChargeType.FIXED
}

function toDecimal(value: number | null | undefined): Prisma.Decimal | undefined {
  if (value === null || value === undefined) return undefined
  return new Prisma.Decimal(value)
}

export type StockSortBy =
  | "createdAt"
  | "stockCode"
  | "netWeight"
  | "saleAmount"
  | "product"
  | "metalType"
  | "purity"
  | "quantity"
  | "status"
  | "finish"
  | "location"
  | "purchaseDate"
export type StockSortOrder = "asc" | "desc"

export type GetInventoryStockParams = {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: StockSortBy
  sortOrder?: StockSortOrder
  /** Filters by the store's own StoreMetal id (Settings > Taxonomy) — or
   * "UNASSIGNED" for stock with no metal set. Dynamic: whatever the store
   * has configured, not a fixed set of categories. */
  metalTypeId?: string
  dateFrom?: string
  dateTo?: string
  /** "IN_STOCK" (quantity > 0) or "OOS" (quantity = 0) — the toolbar's
   * Status filter, labeled "In Stock"/"Out of Stock"/"Both" (see
   * StockToolbar). Stock has no Active/Inactive concept of its own;
   * availability is this and only this. */
  status?: string
  /** StoreCategory / StoreCategoryType ids — filter by the linked
   * Product's own Category and Type (stock rows carry neither directly). */
  categoryId?: string
  categoryTypeId?: string
  /** StoreMetalOrigin id (Natural / Lab-Grown ...) — the linked Product's
   * stoneOriginOptionId. */
  stoneOriginOptionId?: string
}

type ExportInventoryStockParams = {
  selectedIds?: string[]
  search?: string
  sortBy?: string
  sortOrder?: StockSortOrder
  type?: string
  status?: string
  dateFrom?: string
  dateTo?: string
  category?: string
  categoryType?: string
  stoneType?: string
  format?: "csv" | "xlsx" | "pdf"
}

const STOCK_INCLUDE = {
  metalType: {
    select: { id: true, name: true },
  },
  location: {
    select: { id: true, name: true },
  },
  product: {
    select: {
      id: true,
      productCode: true,
      name: true,
      category: { select: { id: true, name: true } },
      categoryType: { select: { id: true, name: true } },
      metalType: { select: { id: true, name: true } },
      defaultPurity: true,
    },
  },
} as const

/**
 * "Type" filters directly by the store's own configured StoreMetal id —
 * whatever metals/stones this store has set up in Settings > Taxonomy, not
 * a fixed set of hardcoded categories. A store adding a new metal or stone
 * there needs no code change for it to show up as its own filter option
 * (see getStoreMetals, used by the Stock/Karigars toolbars to build the
 * dropdown). The sentinel "UNASSIGNED" filters to rows with no metal set at
 * all, since InventoryStock.metalTypeId is nullable.
 */
function getStockWhere(
  storeId: string,
  search: string | undefined,
  scope: LocationScope,
  metalTypeId?: string,
  dateFrom?: string,
  dateTo?: string,
  availability?: string,
  categoryId?: string,
  categoryTypeId?: string,
  stoneOriginOptionId?: string,
) {
  const query = String(search || "").trim()
  const from = parseDateRangeBoundary(dateFrom, false)
  const to = parseDateRangeBoundary(dateTo, true)

  return {
    storeId,
    ...locationWhere(scope),
    ...(metalTypeId === UNASSIGNED_METAL_TYPE
      ? { metalTypeId: null }
      : metalTypeId
        ? { metalTypeId }
        : {}),
    // Category/Type live on the Product, not the stock row.
    ...(categoryId || categoryTypeId || stoneOriginOptionId
      ? {
          product: {
            ...(categoryId ? { categoryId } : {}),
            ...(categoryTypeId ? { categoryTypeId } : {}),
            ...(stoneOriginOptionId ? { stoneOriginOptionId } : {}),
          },
        }
      : {}),
    // "Both" (the default) applies no filter at all — see StockToolbar's
    // statusAllLabel.
    ...(availability === "IN_STOCK"
      ? { quantity: { gt: 0 } }
      : availability === "OOS"
        ? { quantity: 0 }
        : {}),
    ...(from || to ? { purchaseDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(query
      ? {
          OR: [
            { stockCode: { contains: query, mode: "insensitive" as const } },
            { tagNumber: { contains: query, mode: "insensitive" as const } },
            {
              product: {
                name: { contains: query, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  }
}

function getStockOrderBy(
  sortBy: StockSortBy = "createdAt",
  sortOrder: StockSortOrder = "desc"
) {
  const primary =
    sortBy === "stockCode" ? { stockCode: sortOrder }
    : sortBy === "netWeight" ? { netWeight: sortOrder }
    : sortBy === "saleAmount" ? { saleAmount: sortOrder }
    : sortBy === "product" ? { product: { name: sortOrder } }
    : sortBy === "metalType" ? { metalType: { name: sortOrder } }
    : sortBy === "purity" ? { purity: sortOrder }
    : sortBy === "quantity" ? { quantity: sortOrder }
    : sortBy === "status" ? { status: sortOrder }
    : sortBy === "finish" ? { finish: sortOrder }
    : sortBy === "location" ? { location: { name: sortOrder } }
    : sortBy === "purchaseDate" ? { purchaseDate: sortOrder }
    : { createdAt: sortOrder }

  return [primary]
}

function mapStockRow(row: any) {
  return {
    ...row,
    grossWeight: row.grossWeight?.toString() ?? null,
    lessWeight: row.lessWeight?.toString() ?? null,
    netWeight: row.netWeight?.toString() ?? null,
    fineWeight: row.fineWeight?.toString() ?? null,
    stoneWeight: row.stoneWeight?.toString() ?? null,
    caratWeight: row.caratWeight?.toString() ?? null,
    dmoWeight: row.dmoWeight?.toString() ?? null,
    wastagePercent: row.wastagePercent?.toString() ?? null,
    purchaseRate: row.purchaseRate?.toString() ?? null,
    saleRate: row.saleRate?.toString() ?? null,
    makingCharge: row.makingCharge?.toString() ?? null,
    stoneCharge: row.stoneCharge?.toString() ?? null,
    stoneRate: row.stoneRate?.toString() ?? null,
    stoneMetalTypeName: row.stoneMetalTypeName ?? null,
    stoneTypeNames: row.stoneTypeNames ?? null,
    otherCharge: row.otherCharge?.toString() ?? null,
    purchaseAmount: row.purchaseAmount?.toString() ?? null,
    saleAmount: row.saleAmount?.toString() ?? null,
  }
}

export async function getInventoryStock(params: GetInventoryStockParams = {}) {
  const page = Math.max(1, Number(params.page || 1))
  const pageSize = Math.max(1, Number(params.pageSize || 10))
  const search = String(params.search || "").trim()
  const sortBy: StockSortBy = params.sortBy || "createdAt"
  const sortOrder: StockSortOrder = params.sortOrder || "desc"

  const storeId = await requireStoreScope()
  const scope = await getLocationScope()
  const where = getStockWhere(storeId, search, scope, params.metalTypeId, params.dateFrom, params.dateTo, params.status, params.categoryId, params.categoryTypeId, params.stoneOriginOptionId)
  const orderBy = getStockOrderBy(sortBy, sortOrder)

  const [totalCount, rows, sums] = await Promise.all([
    prisma.inventoryStock.count({ where }),
    prisma.inventoryStock.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: STOCK_INCLUDE,
    }),
    // Footer totals across every matching row, not just this page — plain
    // column sums, so they match what the Gross/Net/Qty columns show.
    prisma.inventoryStock.aggregate({
      where,
      _sum: { grossWeight: true, netWeight: true, fineWeight: true, quantity: true },
    }),
  ])

  const stockItems = rows.map(mapStockRow)
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return {
    stockItems,
    totals: {
      grossWeight: Number(sums._sum.grossWeight ?? 0),
      netWeight: Number(sums._sum.netWeight ?? 0),
      fineWeight: Number(sums._sum.fineWeight ?? 0),
      quantity: sums._sum.quantity ?? 0,
    },
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  }
}

async function getAllInventoryStockForExport(
  params: ExportInventoryStockParams = {}
) {
  const validSortBy: StockSortBy[] = [
    "createdAt",
    "stockCode",
    "netWeight",
    "saleAmount",
    "product",
    "metalType",
    "purity",
    "quantity",
    "status",
    "finish",
    "location",
    "purchaseDate",
  ]
  const sortBy: StockSortBy = validSortBy.includes(params.sortBy as StockSortBy)
    ? (params.sortBy as StockSortBy)
    : "createdAt"
  const sortOrder: StockSortOrder = params.sortOrder || "desc"

  const storeId = await requireStoreScope()
  const scope = await getLocationScope()

  const where = params.selectedIds?.length
    ? {
        id: { in: params.selectedIds },
        storeId,
        ...locationWhere(scope),
      }
    : getStockWhere(storeId, params.search, scope, params.type, params.dateFrom, params.dateTo, params.status, params.category, params.categoryType, params.stoneType)

  const rows = await prisma.inventoryStock.findMany({
    where,
    orderBy: getStockOrderBy(sortBy, sortOrder),
    include: {
      ...STOCK_INCLUDE,
      // A piece of several metals/stones — the export's "Metals & Stones" column.
      components: {
        orderBy: { sortOrder: "asc" },
        include: { metalType: { select: { name: true } } },
      },
    },
  })

  return rows.map(mapStockRow)
}

export async function exportInventoryStockToExcel(
  params: ExportInventoryStockParams = {}
): Promise<{
  success: boolean
  message: string
  fileName?: string
  fileBase64?: string
}> {
  try {
    const stockItems = await getAllInventoryStockForExport(params)

    if (!stockItems.length) {
      return {
        success: false,
        message: "No stock items found to export.",
      }
    }

    // CSV/Excel: exactly the stock import template's columns, in its order,
    // with values the import reads back (so an exported file can be edited
    // and imported — clear Stock Code to add rows as new pieces). The PDF
    // keeps its own shorter, readable column set.
    const num = (value: { toString(): string } | null | undefined) => (value == null ? "" : Number(value))
    // This store's columns only (lib/sheet-features.ts).
    const storeId = await requireStoreScope()
    const features = await getSheetFeatures(storeId)
    const headers = stockSheetHeaders(features)
    const rows = stockItems.map((item) => {
      const values: Record<string, unknown> = {
        "Product Code": item.product?.productCode ?? "",
        "Product Name": item.product?.name ?? "",
        "Stock Code": item.stockCode,
        "Tag Number": item.tagNumber ?? "",
        Status: STOCK_STATUS_LABELS[item.status as InventoryStockStatus] ?? "",
        Finish: finishLabel(item.finish),
        Quantity: item.quantity,
        "Gross Weight (g)": num(item.grossWeight),
        "Less Weight (g)": num(item.lessWeight),
        "Net Weight (g)": num(item.netWeight),
        "Stone Weight (g)": num(item.stoneWeight),
        "Carat Weight (ct)": num(item.caratWeight),
        "Purchase Rate": num(item.purchaseRate),
        "Sale Rate": num(item.saleRate),
        "Other Charge": num(item.otherCharge),
        "Purchase Amount": num(item.purchaseAmount),
        "Sale Amount": num(item.saleAmount),
        "Vendor Name": item.vendorName ?? "",
        "Purchase Date": formatSheetDate(item.purchaseDate),
        "Date of Manufacture": formatSheetDate(item.manufactureDate),
        Location: item.location?.name ?? "",
        Remarks: item.remarks ?? "",
        "Metal Type": item.metalType?.name ?? "",
        Purity: item.purityLabel ?? (item.purity ? PURITY_LABELS[item.purity as PurityType] : ""),
        "Fine Weight (g)": num(item.fineWeight),
        "Metals & Stones": describePieceComponentsText(item.components),
        "Created At": item.createdAt ? formatShortDateTime(item.createdAt) : "",
      }
      return pickSheetRow(values, headers)
    })
    const pdfRows = () =>
      stockItems.map((item, index) => ({
      "Sr. No.": index + 1,
      "Stock Code": item.stockCode,
      "Tag Number": item.tagNumber || "-",
      "Product Name": item.product?.name || "-",
      "Product Code": item.product?.productCode || "-",
      "Metal Type": item.metalType?.name || "-",
      Purity: item.purity || "-",
      Quantity: item.quantity,
      "Gross Weight (g)": item.grossWeight || "-",
      "Net Weight (g)": item.netWeight || "-",
      "Stone Weight (g)": item.stoneWeight || "-",
      "Carat Weight (ct)": item.caratWeight || "-",
      [METALS_AND_STONES_COLUMN]: describePieceComponentsText(item.components),
      "Purchase Rate": item.purchaseRate || "-",
      "Sale Rate": item.saleRate || "-",
      "Making Charge": item.makingCharge || "-",
      "Purchase Amount": item.purchaseAmount || "-",
      "Sale Amount": item.saleAmount || "-",
      Status: item.status || "-",
      Finish: finishLabel(item.finish),
      Location: item.location?.name || "-",
      "Vendor Name": item.vendorName || "-",
      "Purchase Date": item.purchaseDate ? formatShortDate(item.purchaseDate) : "-",
      "Created At": item.createdAt ? formatShortDateTime(item.createdAt) : "-",
    }))

    const { fileName, fileBase64 } =
      params.format === "csv"
        ? buildCsvExportBase64(rows, "inventory-stock")
        : params.format === "pdf"
          ? buildPdfExportBase64(pdfRows(), "Inventory Stock", "inventory-stock")
          : buildImportTemplateWithDropdowns({
              sheetName: "Stock",
              rows,
              columns: headers,
              dropdowns: dropdownsFor(await loadStockSheetDropdowns(storeId), headers),
              instructions: { notes: STOCK_SHEET_NOTES, rows: stockSheetInstructions(features) },
              filePrefix: "inventory-stock",
            })

    return {
      success: true,
      message: "Stock exported successfully.",
      fileName,
      fileBase64,
    }
  } catch (error) {
    logger.error("exportInventoryStockToExcel error", error)
    return {
      success: false,
      message: actionErrorMessage(error, "Failed to export stock."),
    }
  }
}
export async function getInventoryStockFormProducts() {
  const storeId = await requireStoreScope()

  const products = await prisma.product.findMany({
    where: {
      storeId,
      isActive: true,
    },
    orderBy: [
      { name: "asc" },
      { productCode: "asc" },
    ],
    select: {
      id: true,
      productCode: true,
      name: true,
      category: { select: { id: true, name: true } },
      categoryType: { select: { id: true, name: true } },
      metalType: { select: { id: true, name: true } },
      defaultPurity: true,
      defaultMakingCharge: true,
      defaultStoneCharge: true,
      defaultGrossWeight: true,
      defaultNetWeight: true,
      defaultStoneWeight: true,
      defaultCaratWeight: true,
      defaultFinish: true,
      isActive: true,
    },
  })

  return products.map((product) => ({
    ...product,
    category: product.category ?? null,
    categoryType: product.categoryType ?? null,
    metalType: product.metalType ?? null,
    defaultPurity: product.defaultPurity ?? null,
    defaultMakingCharge: product.defaultMakingCharge?.toString() ?? null,
    defaultStoneCharge: product.defaultStoneCharge?.toString() ?? null,
    defaultGrossWeight: product.defaultGrossWeight?.toString() ?? null,
    defaultNetWeight: product.defaultNetWeight?.toString() ?? null,
    defaultStoneWeight: product.defaultStoneWeight?.toString() ?? null,
    defaultCaratWeight: product.defaultCaratWeight?.toString() ?? null,
  }))
}

/** The next sequential Stock Code for this store — same STK-{year}-{0001}
 * numbering and "highest existing wins" convention already used by the
 * bulk Excel import, so a manually-created entry and an imported one
 * never collide or diverge. Pre-fills the Add Stock form's own Stock
 * Code field (still editable — this is a suggestion, not a lock). */
export async function getNextStockCode(): Promise<string> {
  const storeId = await requireStoreScope()

  const existingCodes = await prisma.inventoryStock.findMany({
    where: { storeId, stockCode: { startsWith: "STK-" } },
    select: { stockCode: true },
  })

  const highestCode = existingCodes.reduce((max, row) => {
    const match = /^STK-(?:\d{4}-)?(\d+)$/.exec(row.stockCode)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)

  const year = new Date().getFullYear()
  return `STK-${year}-${String(highestCode + 1).padStart(4, "0")}`
}

export async function getInventoryStockById(id: string) {
  // A read, called directly from the client-side Stock master-detail panel
  // (components/inventory/stock/stock-detail-panel.tsx) — see
  // getStoreIdForRead's own doc comment for why requireStoreScope() would
  // wrongly go dark here on an expired-plan store.
  const storeId = await getStoreIdForRead()

  const row = await prisma.inventoryStock.findFirst({
    where: { id, storeId },
    include: {
      metalType: {
        select: { id: true, name: true },
      },
      location: {
        select: { id: true, name: true },
      },
      product: {
        select: {
          id: true,
          productCode: true,
          name: true,
          category: { select: { id: true, name: true } },
          categoryType: { select: { id: true, name: true } },
          metalType: { select: { id: true, name: true } },
          defaultPurity: true,
          defaultMakingCharge: true,
          defaultStoneCharge: true,
          designCode: true,
          hsnCode: true,
          description: true,
          notes: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  })

  if (!row) return null

  return {
    ...row,
    grossWeight: row.grossWeight?.toString() ?? null,
    lessWeight: row.lessWeight?.toString() ?? null,
    netWeight: row.netWeight?.toString() ?? null,
    stoneWeight: row.stoneWeight?.toString() ?? null,
    caratWeight: row.caratWeight?.toString() ?? null,
    dmoWeight: row.dmoWeight?.toString() ?? null,
    wastagePercent: row.wastagePercent?.toString() ?? null,
    purchaseRate: row.purchaseRate?.toString() ?? null,
    saleRate: row.saleRate?.toString() ?? null,
    makingCharge: row.makingCharge?.toString() ?? null,
    stoneCharge: row.stoneCharge?.toString() ?? null,
    stoneRate: row.stoneRate?.toString() ?? null,
    stoneMetalTypeName: row.stoneMetalTypeName ?? null,
    stoneTypeNames: row.stoneTypeNames ?? null,
    otherCharge: row.otherCharge?.toString() ?? null,
    purchaseAmount: row.purchaseAmount?.toString() ?? null,
    saleAmount: row.saleAmount?.toString() ?? null,

    product: row.product
      ? {
          ...row.product,
          defaultMakingCharge:
            row.product.defaultMakingCharge?.toString() ?? null,
          defaultStoneCharge:
            row.product.defaultStoneCharge?.toString() ?? null,
        }
      : null,
  }
}

export async function createInventoryStock(
  prevState: StockFormState,
  formData: FormData
): Promise<StockFormState> {
  try {
    const productId = String(formData.get("productId") || "").trim()
    const stockCode = String(formData.get("stockCode") || "").trim()
    const tagNumber = parseNullableString(formData.get("tagNumber"))

    // Metal, purity and the making/stone charges are no longer submitted by
    // the form — they are read off the product below, so the same facts are
    // never captured in two places.

    const status =
      (parseOptionalEnum(
        formData.get("status"),
        Object.values(InventoryStockStatus)
      ) as InventoryStockStatus | null) ?? InventoryStockStatus.IN_STOCK

    const finish =
      (parseOptionalEnum(
        formData.get("finish"),
        Object.values(InventoryFinish)
      ) as InventoryFinish | null) ?? InventoryFinish.KACHA

    const quantity = parseOptionalInt(formData.get("quantity")) ?? 1

    const grossWeight = parseOptionalNumber(formData.get("grossWeight"))
    const lessWeight = parseOptionalNumber(formData.get("lessWeight"))
    const netWeight = parseOptionalNumber(formData.get("netWeight"))
    const stoneWeight = parseOptionalNumber(formData.get("stoneWeight"))
    const caratWeight = parseOptionalNumber(formData.get("caratWeight"))
    const dmoWeight = parseOptionalNumber(formData.get("dmoWeight"))
    const wastagePercent = parseOptionalNumber(formData.get("wastagePercent"))

    const purchaseRate = parseOptionalNumber(formData.get("purchaseRate"))
    const saleRate = parseOptionalNumber(formData.get("saleRate"))
    const otherCharge = parseOptionalNumber(formData.get("otherCharge"))
    const purchaseAmount = parseOptionalNumber(formData.get("purchaseAmount"))
    const saleAmount = parseOptionalNumber(formData.get("saleAmount"))

    const vendorName = parseNullableString(formData.get("vendorName"))
    const locationId = parseNullableString(formData.get("locationId"))
    const remarks = parseNullableString(formData.get("remarks"))

    const purchaseDateValue = String(formData.get("purchaseDate") || "").trim()
    const purchaseDate = purchaseDateValue ? new Date(purchaseDateValue) : null

    const manufactureDateValue = String(
      formData.get("manufactureDate") || ""
    ).trim()
    const manufactureDate = manufactureDateValue
      ? new Date(manufactureDateValue)
      : null

    const errors: Record<string, string[]> = {}

    if (!productId) {
      errors.productId = ["Product is required"]
    }

    if (!stockCode) {
      errors.stockCode = ["Stock code is required"]
    }

    if (quantity < 1) {
      errors.quantity = ["Quantity must be at least 1"]
    }

    // >= 0, not > 0: a product master is allowed a placeholder 0 weight
    // (product-actions.ts only requires non-null) before it's been
    // physically weighed — stock created against it must accept that same
    // 0, not reject it as if the field were left blank.
    if (grossWeight === null || grossWeight < 0) {
      errors.grossWeight = ["Gross weight is required"]
    }

    if (netWeight === null || netWeight < 0) {
      errors.netWeight = ["Net weight is required"]
    }

    if (Object.keys(errors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors,
      }
    }

    const storeId = await requireStoreScope()
    const currentUser = await getCurrentUser()

    const product = await prisma.product.findFirst({
      where: { id: productId, storeId },
      select: {
        id: true,
        metalTypeId: true,
        defaultPurity: true,
        storeMetalPurity: { select: { label: true } },
        defaultMakingCharge: true,
        defaultMakingChargeType: true,
        defaultStoneCharge: true,
        hasStoneComponent: true,
        defaultStoneRate: true,
        defaultStoneMetalTypeName: true,
        defaultStoneTypeNames: true,
        metalComponents: stockOptionProductDetailsSelect.metalComponents,
        stoneComponents: stockOptionProductDetailsSelect.stoneComponents,
      },
    })

    if (!product) {
      return {
        success: false,
        message: "Selected product is invalid",
        errors: {
          productId: ["Selected product could not be found"],
        },
      }
    }

    if (locationId) {
      const location = await prisma.storeLocation.findFirst({
        where: { id: locationId, storeId },
        select: { id: true },
      })

      if (!location) {
        return {
          success: false,
          message: "Selected location is invalid",
          errors: {
            locationId: ["Selected location could not be found"],
          },
        }
      }

      const scope = await getLocationScope()
      if (!isLocationAllowed(scope, locationId)) {
        return {
          success: false,
          message: "You don't have access to file stock against this location",
          errors: {
            locationId: ["Outside your assigned locations"],
          },
        }
      }
    }

    // Metal was a required field on this form. It still must not be null —
    // the fine-weight maths in the karigar ledger and the gold-flow report
    // depend on it — so the requirement moves onto the product rather than
    // disappearing. No separate store check is needed: the product was
    // already matched on storeId.
    if (!product.metalTypeId) {
      return {
        success: false,
        message:
          "This product has no metal set. Add one on the product, then create the stock entry.",
        errors: {
          productId: ["Product is missing a metal type"],
        },
      }
    }

    const metalTypeId = product.metalTypeId
    const purity = product.defaultPurity
    const purityLabel = product.storeMetalPurity?.label ?? null
    const makingCharge = product.defaultMakingCharge
    const makingChargeType = product.defaultMakingChargeType
    // A composite product's stone value is auto-computed from this piece's
    // own carat weight × the product's Stone Rate, rather than the flat
    // defaultStoneCharge every other product just copies as-is — the
    // physical stone in a specific piece rarely matches the design's
    // typical weight exactly.
    const stoneRate = product.hasStoneComponent ? product.defaultStoneRate : null
    const stoneCharge =
      product.hasStoneComponent && product.defaultStoneRate != null && caratWeight
        ? new Prisma.Decimal(product.defaultStoneRate).mul(caratWeight)
        : product.defaultStoneCharge
    const stoneMetalTypeName = product.hasStoneComponent ? product.defaultStoneMetalTypeName : null
    const stoneTypeNames = product.hasStoneComponent ? product.defaultStoneTypeNames : null

    const existing = await prisma.inventoryStock.findFirst({
      where: { stockCode, storeId },
      select: { id: true },
    })

    if (existing) {
      return {
        success: false,
        message: "Stock code already exists",
        errors: {
          stockCode: ["This stock code is already in use"],
        },
      }
    }

    // A manual stock add has no vendor/karigar counterparty (unlike a
    // Purchase or a karigar receipt, both of which already log this), so
    // without this entry the gold never appears anywhere on the Ledger.
    const storeMetal = await prisma.storeMetal.findFirst({
      where: { id: metalTypeId, storeId },
      select: { hasPurity: true },
    })

    // Pure-metal weight, stored on the row and posted to the ledger — same
    // rule as every other metal line (lib/fine-weight.ts), which also reads
    // the metal's own purity row instead of only the legacy enum.
    // A Product of several metals / stones: the piece gets one row per
    // metal and stone (lib/inventory/stock-piece-rows.ts newStockPieceRows),
    // the stock row keeps the summary, and the ledger gets one entry per metal.
    const pieceRows = await (async () => {
      if (product.metalComponents.length < 2 && product.stoneComponents.length < 2) return null
      const [fineOf, gstRates, storeMetals] = await Promise.all([
        getFineWeightResolver(storeId),
        prisma.gstRate.findMany({ where: { storeId }, select: { id: true, name: true, ratePercent: true } }),
        prisma.storeMetal.findMany({ where: { storeId }, select: { id: true, hasPurity: true } }),
      ])
      const rows = newStockPieceRows(
        product,
        { netWeight, caratWeight },
        { fineOf, gstById: new Map(gstRates.map((rate) => [rate.id, rate])) },
      )
      return rows ? { rows, hasPurity: new Map(storeMetals.map((metal) => [metal.id, metal.hasPurity])) } : null
    })()

    const fineWeight = pieceRows
      ? pieceRows.rows.fineWeight
      : await resolveFineWeight(storeId, { metalTypeId, purityLabel, purity, netWeight })
    const metalWeightFine = storeMetal?.hasPurity && fineWeight ? fineWeight : undefined
    const stockAddedDescription = `Stock added — ${stockCode}${tagNumber ? ` (Tag ${tagNumber})` : ""}`
    const ledgerMetals = pieceRows
      ? pieceRows.rows.metals.map((row) => {
          const hasPurity = pieceRows.hasPurity.get(row.metalTypeId) ?? false
          return {
            metalTypeId: row.metalTypeId,
            metalWeight: hasPurity ? undefined : row.netWeight,
            metalWeightFine: hasPurity && row.fineWeight ? row.fineWeight : undefined,
          }
        })
      : netWeight && netWeight > 0
        ? [{ metalTypeId, metalWeight: storeMetal?.hasPurity ? undefined : netWeight, metalWeightFine }]
        : []

    await prisma.$transaction([
      prisma.inventoryStock.create({
        data: {
          storeId,
          productId,
          stockCode,
          tagNumber,
          metalTypeId,
          purity,
          purityLabel,
          status,
          finish,
          quantity,
          grossWeight: toDecimal(grossWeight),
          lessWeight: toDecimal(lessWeight),
          netWeight: toDecimal(netWeight),
          fineWeight: toDecimal(fineWeight),
          stoneWeight: toDecimal(stoneWeight),
          caratWeight: toDecimal(caratWeight),
          dmoWeight: toDecimal(dmoWeight),
          wastagePercent: toDecimal(wastagePercent),
          purchaseRate: toDecimal(purchaseRate),
          saleRate: toDecimal(saleRate),
          makingCharge,
          makingChargeType,
          stoneCharge: pieceRows ? pieceRows.rows.stoneCharge : stoneCharge,
          stoneRate: stoneRate ?? undefined,
          stoneMetalTypeName: stoneMetalTypeName ?? undefined,
          stoneTypeNames: stoneTypeNames ?? undefined,
          otherCharge: toDecimal(otherCharge),
          purchaseAmount: toDecimal(purchaseAmount),
          saleAmount: toDecimal(saleAmount),
          vendorName,
          purchaseDate,
          manufactureDate,
          locationId,
          remarks,
          createdById: currentUser?.id ?? undefined,
          createdByName: currentUser?.name ?? undefined,
          createdByRole: currentUser?.role ?? undefined,
          ...(pieceRows ? { components: { createMany: { data: pieceRows.rows.components } } } : {}),
        },
      }),
      ...ledgerMetals.map((metal) =>
        prisma.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.DEBIT,
            sourceType: LedgerSourceType.ADJUSTMENT,
            metalTypeId: metal.metalTypeId,
            metalWeight: metal.metalWeight,
            metalWeightFine: metal.metalWeightFine,
            amount: 0,
            description: stockAddedDescription,
            locationId: locationId ?? undefined,
          },
        }),
      ),
    ])

    revalidatePath("/inventory")
    revalidatePath("/inventory/stock")
    revalidatePath("/ledger")

    return {
      success: true,
      message: "Stock added successfully",
      errors: {},
    }
  } catch (error) {
    logger.error("createInventoryStock error", error)
    return {
      success: false,
      message: actionErrorMessage(error, "Failed to add stock"),
      errors: {},
    }
  }
}

export async function updateInventoryStock(
  id: string,
  prevState: StockFormState,
  formData: FormData
): Promise<StockFormState> {
  try {
    const storeId = await requireStoreScope()

    const existingStock = await prisma.inventoryStock.findFirst({
      where: { id, storeId },
      select: {
        id: true,
        // Fallback values for when the row is locked for core changes: the
        // form no longer submits these, so without them a locked edit would
        // null out metal/purity/charges on save.
        metalTypeId: true,
        purity: true,
        purityLabel: true,
        makingCharge: true,
        makingChargeType: true,
        stoneCharge: true,
        stoneRate: true,
        stoneMetalTypeName: true,
        stoneTypeNames: true,
        invoiceItems: {
          select: { id: true },
          take: 1,
        },
        kachaInvoiceItems: {
          select: { id: true },
          take: 1,
        },
        karigarJobs: {
          select: { id: true },
          take: 1,
        },
        // For re-splitting an Add Stock piece's metal / stone rows when its
        // weights change (see below): what it was split from, and whether a
        // Purchase or an artisan receipt wrote its rows instead.
        productId: true,
        netWeight: true,
        caratWeight: true,
        fineWeight: true,
        components: { orderBy: { sortOrder: "asc" } },
        purchaseItems: { select: { id: true }, take: 1 },
        karigarReceiptItems: { select: { id: true }, take: 1 },
      },
    })

    if (!existingStock) {
      return {
        success: false,
        message: "Stock item not found",
        errors: {},
      }
    }

    const isLockedForCoreChanges =
      existingStock.invoiceItems.length > 0 ||
      existingStock.kachaInvoiceItems.length > 0 ||
      existingStock.karigarJobs.length > 0

    const productId = String(formData.get("productId") || "").trim()
    const stockCode = String(formData.get("stockCode") || "").trim()
    const tagNumber = parseNullableString(formData.get("tagNumber"))

    // Not submitted by the form any more; inherited from the product below
    // when the row is still editable, otherwise kept exactly as-is.
    let metalTypeId = existingStock.metalTypeId
    let purity = existingStock.purity
    let purityLabel = existingStock.purityLabel
    let makingCharge = existingStock.makingCharge
    let makingChargeType = existingStock.makingChargeType
    let stoneCharge = existingStock.stoneCharge

    const status =
      (parseOptionalEnum(
        formData.get("status"),
        Object.values(InventoryStockStatus)
      ) as InventoryStockStatus | null) ?? InventoryStockStatus.IN_STOCK

    const finish =
      (parseOptionalEnum(
        formData.get("finish"),
        Object.values(InventoryFinish)
      ) as InventoryFinish | null) ?? InventoryFinish.KACHA

    const quantity = parseOptionalInt(formData.get("quantity")) ?? 1

    const grossWeight = parseOptionalNumber(formData.get("grossWeight"))
    const lessWeight = parseOptionalNumber(formData.get("lessWeight"))
    const netWeight = parseOptionalNumber(formData.get("netWeight"))
    const stoneWeight = parseOptionalNumber(formData.get("stoneWeight"))
    const caratWeight = parseOptionalNumber(formData.get("caratWeight"))
    const dmoWeight = parseOptionalNumber(formData.get("dmoWeight"))
    const wastagePercent = parseOptionalNumber(formData.get("wastagePercent"))

    const purchaseRate = parseOptionalNumber(formData.get("purchaseRate"))
    const saleRate = parseOptionalNumber(formData.get("saleRate"))
    const otherCharge = parseOptionalNumber(formData.get("otherCharge"))
    const purchaseAmount = parseOptionalNumber(formData.get("purchaseAmount"))
    const saleAmount = parseOptionalNumber(formData.get("saleAmount"))

    const vendorName = parseNullableString(formData.get("vendorName"))
    const locationId = parseNullableString(formData.get("locationId"))
    const remarks = parseNullableString(formData.get("remarks"))

    const purchaseDateValue = String(formData.get("purchaseDate") || "").trim()
    const purchaseDate = purchaseDateValue ? new Date(purchaseDateValue) : null

    const manufactureDateValue = String(
      formData.get("manufactureDate") || ""
    ).trim()
    const manufactureDate = manufactureDateValue
      ? new Date(manufactureDateValue)
      : null

    const errors: Record<string, string[]> = {}

    if (!productId) {
      errors.productId = ["Product is required"]
    }

    if (!stockCode) {
      errors.stockCode = ["Stock code is required"]
    }

    if (quantity < 1) {
      errors.quantity = ["Quantity must be at least 1"]
    }

    // >= 0, not > 0: a product master is allowed a placeholder 0 weight
    // (product-actions.ts only requires non-null) before it's been
    // physically weighed — stock created against it must accept that same
    // 0, not reject it as if the field were left blank.
    if (grossWeight === null || grossWeight < 0) {
      errors.grossWeight = ["Gross weight is required"]
    }

    if (netWeight === null || netWeight < 0) {
      errors.netWeight = ["Net weight is required"]
    }

    if (Object.keys(errors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors,
      }
    }

    const duplicate = await prisma.inventoryStock.findFirst({
      where: {
        stockCode,
        storeId,
        NOT: { id },
      },
      select: { id: true },
    })

    if (duplicate) {
      return {
        success: false,
        message: "Stock code already exists",
        errors: {
          stockCode: ["This stock code is already in use"],
        },
      }
    }

    if (locationId) {
      const location = await prisma.storeLocation.findFirst({
        where: { id: locationId, storeId },
        select: { id: true },
      })

      if (!location) {
        return {
          success: false,
          message: "Selected location is invalid",
          errors: {
            locationId: ["Selected location could not be found"],
          },
        }
      }

      const scope = await getLocationScope()
      if (!isLocationAllowed(scope, locationId)) {
        return {
          success: false,
          message: "You don't have access to file stock against this location",
          errors: {
            locationId: ["Outside your assigned locations"],
          },
        }
      }
    }

    // Preserved as-is when locked (product unchanged) — same convention as
    // stoneCharge/makingCharge above, so editing other fields on this stock
    // row never silently wipes what a prior product selection already set.
    let stoneRate: Prisma.Decimal | null = existingStock.stoneRate
    let stoneMetalTypeName: string | null = existingStock.stoneMetalTypeName
    let stoneTypeNames: string | null = existingStock.stoneTypeNames

    if (!isLockedForCoreChanges) {
      const product = await prisma.product.findFirst({
        where: { id: productId, storeId },
        select: {
          id: true,
          metalTypeId: true,
          defaultPurity: true,
          storeMetalPurity: { select: { label: true } },
          defaultMakingCharge: true,
          defaultMakingChargeType: true,
          defaultStoneCharge: true,
          hasStoneComponent: true,
          defaultStoneRate: true,
          defaultStoneMetalTypeName: true,
          defaultStoneTypeNames: true,
        },
      })

      if (!product) {
        return {
          success: false,
          message: "Selected product is invalid",
          errors: {
            productId: ["Selected product could not be found"],
          },
        }
      }

      if (!product.metalTypeId) {
        return {
          success: false,
          message:
            "This product has no metal set. Add one on the product, then save the stock entry.",
          errors: {
            productId: ["Product is missing a metal type"],
          },
        }
      }

      metalTypeId = product.metalTypeId
      purity = product.defaultPurity
      purityLabel = product.storeMetalPurity?.label ?? null
      makingCharge = product.defaultMakingCharge
      makingChargeType = product.defaultMakingChargeType
      stoneRate = product.hasStoneComponent ? product.defaultStoneRate : null
      stoneCharge =
        product.hasStoneComponent && product.defaultStoneRate != null && caratWeight
          ? new Prisma.Decimal(product.defaultStoneRate).mul(caratWeight)
          : product.defaultStoneCharge
      stoneMetalTypeName = product.hasStoneComponent ? product.defaultStoneMetalTypeName : null
      stoneTypeNames = product.hasStoneComponent ? product.defaultStoneTypeNames : null
    }

    // A piece with its own metal / stone rows (lib/inventory/stock-piece-rows.ts).
    // Rows Add Stock / the import split from the Product (newStockPieceRows)
    // follow a weight edit: re-split in the Product's proportions, summaries
    // recomputed as on create. Any other rows (Purchase, artisan receipt, a
    // hand-typed multi-part sale line) are physical facts recorded row by
    // row — left exactly as they are, and so are the stock row's fine weight
    // and stone value, which summarise them.
    const pieceRowsPlan = isLockedForCoreChanges ? null : await planStockPieceRowsEdit(storeId, existingStock, {
      productId,
      netWeight,
      caratWeight,
    })

    /**
     * If stock is already linked to invoice / karigar jobs,
     * block changes to structural fields that can break history.
     */
    if (isLockedForCoreChanges) {
      await prisma.inventoryStock.update({
        where: { id },
        data: {
          status,
          finish,
          locationId,
          remarks,
          vendorName,
        },
      })

      revalidatePath("/inventory")
      revalidatePath("/inventory/stock")
      revalidatePath(`/inventory/stock/${id}`)
      revalidatePath(`/inventory/stock/${id}/edit`)

      return {
        success: true,
        message:
          "Stock updated successfully. Some core fields were locked because this stock is already linked to invoice / artisan records.",
        errors: {},
      }
    }

    const summary = pieceRowsPlan?.summary
    const fineWeight = summary
      ? summary.fineWeight
      : toDecimal(await resolveFineWeight(storeId, { metalTypeId, purityLabel, purity, netWeight })) ?? null

    await prisma.$transaction([
      ...(pieceRowsPlan?.writes ?? []),
      prisma.inventoryStock.update({
      where: { id },
      data: {
        productId,
        stockCode,
        tagNumber,
        metalTypeId,
        purity,
        purityLabel,
        status,
        finish,
        quantity,
        grossWeight: toDecimal(grossWeight),
        lessWeight: toDecimal(lessWeight),
        netWeight: toDecimal(netWeight),
        fineWeight,
        stoneWeight: toDecimal(stoneWeight),
        caratWeight: toDecimal(caratWeight),
        dmoWeight: toDecimal(dmoWeight),
        wastagePercent: toDecimal(wastagePercent),
        purchaseRate: toDecimal(purchaseRate),
        saleRate: toDecimal(saleRate),
        makingCharge,
        makingChargeType,
        stoneCharge: summary ? summary.stoneCharge : stoneCharge,
        stoneRate,
        stoneMetalTypeName,
        stoneTypeNames,
        otherCharge: toDecimal(otherCharge),
        purchaseAmount: toDecimal(purchaseAmount),
        saleAmount: toDecimal(saleAmount),
        vendorName,
        purchaseDate,
        manufactureDate,
        locationId,
        remarks,
      },
      }),
    ])

    revalidatePath("/inventory")
    revalidatePath("/inventory/stock")
    revalidatePath(`/inventory/stock/${id}`)
    revalidatePath(`/inventory/stock/${id}/edit`)

    return {
      success: true,
      message: "Stock updated successfully",
      errors: {},
    }
  } catch (error) {
    logger.error("updateInventoryStock error", error)
    return {
      success: false,
      message: actionErrorMessage(error, "Failed to update stock"),
      errors: {},
    }
  }
}

type StockForPieceEdit = {
  id: string
  productId: string
  netWeight: Prisma.Decimal | null
  caratWeight: Prisma.Decimal | null
  fineWeight: Prisma.Decimal | null
  stoneCharge: Prisma.Decimal | null
  components: Prisma.PieceComponentGetPayload<object>[]
  purchaseItems: { id: string }[]
  karigarReceiptItems: { id: string }[]
}

/**
 * What an (unlocked) stock edit does to a piece's metal / stone rows.
 * null = the piece has no rows: the stock row's own fields are saved as
 * before. Otherwise `summary` replaces the stock row's fineWeight /
 * stoneCharge and `writes` run in the same transaction as the update.
 *
 * The rule for "Add Stock split these rows": the piece wasn't bought on a
 * Purchase or received from an artisan, and its rows are exactly what
 * newStockPieceRows makes of its (current) Product for the weights the
 * stock row carried before this edit. Only then are they re-split — in
 * place for the same Product (each row keeps its pcs / clarity /
 * certificate, rate and GST), or rewritten from the new Product's rows when
 * the Product changed. Rows that don't pass (Purchase, artisan receipt, a
 * multi-part sale line's hand-entered rows, or a Product whose rows were
 * edited since) are left untouched, with the summaries they already had.
 */
async function planStockPieceRowsEdit(
  storeId: string,
  stock: StockForPieceEdit,
  next: { productId: string; netWeight: number | null; caratWeight: number | null },
): Promise<null | {
  /** null = compute the stock row's own fields as for a plain piece. */
  summary: { fineWeight: Prisma.Decimal | null; stoneCharge: Prisma.Decimal | null } | null
  writes: Prisma.PrismaPromise<unknown>[]
}> {
  if (!stock.components.length) return null
  const keepAsIs = {
    summary: { fineWeight: stock.fineWeight, stoneCharge: stock.stoneCharge },
    writes: [],
  }
  if (stock.purchaseItems.length || stock.karigarReceiptItems.length) return keepAsIs

  const productSelect = {
    metalComponents: stockOptionProductDetailsSelect.metalComponents,
    stoneComponents: stockOptionProductDetailsSelect.stoneComponents,
  } satisfies Prisma.ProductSelect
  const [fineOf, gstRates, previousProduct] = await Promise.all([
    getFineWeightResolver(storeId),
    prisma.gstRate.findMany({ where: { storeId }, select: { id: true, name: true, ratePercent: true } }),
    prisma.product.findFirst({ where: { id: stock.productId, storeId }, select: productSelect }),
  ])
  if (!previousProduct) return keepAsIs
  const options = { fineOf, gstById: new Map(gstRates.map((rate) => [rate.id, rate])) }
  const asNumber = (value: Prisma.Decimal | null) => (value == null ? null : Number(value))
  const previousSplit = newStockPieceRows(
    previousProduct,
    { netWeight: asNumber(stock.netWeight), caratWeight: asNumber(stock.caratWeight) },
    options,
  )
  if (!isProportionalStockSplit(stock.components, previousSplit)) return keepAsIs

  const decimal = (value: number | null) => (value == null ? null : new Prisma.Decimal(value))
  const entered = { netWeight: next.netWeight, caratWeight: next.caratWeight }

  if (next.productId === stock.productId) {
    const split = newStockPieceRows(previousProduct, entered, options)
    if (!split) return keepAsIs
    const resplit = resplitStockPieceRows(stock.components, split)
    return {
      summary: { fineWeight: decimal(resplit.fineWeight), stoneCharge: new Prisma.Decimal(resplit.stoneCharge) },
      writes: resplit.updates.map((update) =>
        prisma.pieceComponent.update({ where: { id: update.id }, data: update.data }),
      ),
    }
  }

  // A different Product: the old split goes; the new Product's rows come in
  // exactly as Add Stock writes them (none for a single-metal, single-stone
  // Product, whose stock row's own fields then describe it).
  const newProduct = await prisma.product.findFirst({ where: { id: next.productId, storeId }, select: productSelect })
  const split = newProduct ? newStockPieceRows(newProduct, entered, options) : null
  const clear = prisma.pieceComponent.deleteMany({ where: { inventoryStockId: stock.id } })
  if (!split) return { summary: null, writes: [clear] }
  return {
    summary: { fineWeight: decimal(split.fineWeight), stoneCharge: new Prisma.Decimal(split.stoneCharge) },
    writes: [
      clear,
      prisma.pieceComponent.createMany({
        data: split.components.map((component) => ({ ...component, inventoryStockId: stock.id })),
      }),
    ],
  }
}

export async function deleteInventoryStock(id: string): Promise<StockFormState> {
  try {
    const storeId = await requireStoreScope()

    const stock = await prisma.inventoryStock.findFirst({
      where: { id, storeId },
      select: {
        id: true,
        stockCode: true,
        invoiceItems: {
          select: { id: true },
          take: 1,
        },
        kachaInvoiceItems: {
          select: { id: true },
          take: 1,
        },
        karigarJobs: {
          select: { id: true },
          take: 1,
        },
      },
    })

    if (!stock) {
      return {
        success: false,
        message: "Stock item not found",
        errors: {},
      }
    }

    if (
      stock.invoiceItems.length > 0 ||
      stock.kachaInvoiceItems.length > 0 ||
      stock.karigarJobs.length > 0
    ) {
      return {
        success: false,
        message:
          "This stock cannot be deleted because it is already linked to invoice or artisan records.",
        errors: {},
      }
    }

    await prisma.inventoryStock.delete({
      where: { id },
    })

    revalidatePath("/inventory")
    revalidatePath("/inventory/stock")

    return {
      success: true,
      message: "Stock deleted successfully",
      errors: {},
    }
  } catch (error) {
    logger.error("deleteInventoryStock error", error)
    return {
      success: false,
      message: actionErrorMessage(error, "Failed to delete stock"),
      errors: {},
    }
  }
}

export type BulkDeleteResult = {
  deletedCount: number
  failures: { id: string; message: string }[]
}

/**
 * Deletes each selected stock item through the exact same
 * deleteInventoryStock() call a single-row delete uses — never a bare
 * deleteMany — so a bulk selection can't bypass the invoice/kacha/karigar-
 * job dependency guard just because several rows were ticked at once.
 * Partial success is expected and reported per row, not treated as a
 * whole-batch failure.
 */
export async function bulkDeleteInventoryStock(ids: string[]): Promise<BulkDeleteResult> {
  const failures: BulkDeleteResult["failures"] = []
  let deletedCount = 0

  for (const id of ids) {
    const result = await deleteInventoryStock(id)
    if (result.success) {
      deletedCount++
    } else {
      failures.push({ id, message: result.message })
    }
  }

  return { deletedCount, failures }
}

export type StockImportResult = {
  success: boolean
  message: string
  createdCount?: number
  /** Row-level problems. Populated only when nothing was created — mirrors
   * importKachaInvoicesFromExcel's own contract: the file must be clean
   * before anything is created, so a partial import never leaves the
   * merchant guessing which rows actually landed. */
  errors?: string[]
}

/** The stock template/export dropdown lists, from this store's own records. */
async function loadStockSheetDropdowns(storeId: string): Promise<Record<string, string[]>> {
  const [products, locations] = await Promise.all([
    prisma.product.findMany({ where: { storeId, isActive: true }, select: { productCode: true }, orderBy: { productCode: "asc" } }),
    prisma.storeLocation.findMany({ where: { storeId, isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
  ])
  return {
    "Product Code": products.map((product) => product.productCode),
    Status: IMPORTABLE_STOCK_STATUSES.map((status) => STOCK_STATUS_LABELS[status]),
    Finish: ["Unfinished", "Finished / Hallmarked"],
    Location: locations.map((location) => location.name),
  }
}

/**
 * The stock import template: every Add Stock field in the form's order
 * (see lib/inventory/stock-sheet.ts), an example row, an Instructions sheet
 * and dropdowns from this store's own products and locations.
 */
export async function getStockImportTemplate(): Promise<{
  fileName: string
  fileBase64: string
}> {
  const storeId = await requireStoreScope()
  const features = await getSheetFeatures(storeId)
  const headers = stockSheetHeaders(features)
  const example = Object.fromEntries(stockSheetColumns(features).map((column) => [column.header, column.example]))
  return buildImportTemplateWithDropdowns({
    sheetName: "Stock Import",
    rows: [example],
    columns: headers,
    dropdowns: dropdownsFor(await loadStockSheetDropdowns(storeId), headers),
    instructions: { notes: STOCK_SHEET_NOTES, rows: stockSheetInstructions(features) },
    filePrefix: "stock-import-template",
  })
}

function stockImportCell(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim()
}

/**
 * Bulk Add Stock from a spreadsheet: one row = one new stock entry, with
 * every Add Stock field (lib/inventory/stock-sheet.ts) and the same rules —
 * the product must already exist (never created here), blank weights come
 * from the product, stock codes are unique, the stone charge follows the
 * product's stone rate, and each entry posts the same "stock added" Ledger
 * entry createInventoryStock does. All-or-nothing: any row error imports
 * nothing.
 */
export async function importInventoryStockFromExcel(
  formData: FormData,
): Promise<StockImportResult> {
  try {
    const storeId = await requireStoreScope()
    const currentUser = await getCurrentUser()
    const file = formData.get("file")

    if (!(file instanceof File) || file.size === 0) {
      return { success: false, message: "Choose a .xlsx or .csv file to import." }
    }

    // A column this store's sheets leave out (Location with no locations set
    // up) is ignored if an older file still has it — never an error.
    const rows = stripHiddenSheetColumns(
      parseExcelUpload(await file.arrayBuffer()),
      hiddenSheetHeaders(STOCK_SHEET_COLUMNS, await getSheetFeatures(storeId)),
    )

    if (!rows.length) {
      return { success: false, message: "That file has no rows to import." }
    }

    const [products, locations, existingCodes, metals] = await Promise.all([
      prisma.product.findMany({
        where: { storeId },
        select: {
          id: true,
          productCode: true,
          name: true,
          metalTypeId: true,
          defaultPurity: true,
          storeMetalPurity: { select: { label: true } },
          defaultMakingCharge: true,
          defaultMakingChargeType: true,
          defaultStoneCharge: true,
          defaultStoneRate: true,
          hasStoneComponent: true,
          defaultStoneMetalTypeName: true,
          defaultStoneTypeNames: true,
          defaultFinish: true,
          defaultGrossWeight: true,
          defaultNetWeight: true,
          defaultStoneWeight: true,
          defaultCaratWeight: true,
          metalComponents: stockOptionProductDetailsSelect.metalComponents,
          stoneComponents: stockOptionProductDetailsSelect.stoneComponents,
        },
      }),
      prisma.storeLocation.findMany({ where: { storeId }, select: { id: true, name: true } }),
      prisma.inventoryStock.findMany({
        where: { storeId },
        select: { stockCode: true, product: { select: { productCode: true, name: true } } },
      }),
      prisma.storeMetal.findMany({ where: { storeId }, select: { id: true, hasPurity: true } }),
    ])

    const productByCode = new Map(
      products.map((product) => [product.productCode.trim().toLowerCase(), product]),
    )
    const locationByName = new Map(
      locations.map((location) => [location.name.trim().toLowerCase(), location.id]),
    )
    const metalHasPurity = new Map(metals.map((metal) => [metal.id, metal.hasPurity]))
    const locationScope = await getLocationScope()
    const fineOf = await getFineWeightResolver(storeId)

    const usedCodes = new Set(existingCodes.map((row) => row.stockCode.trim().toLowerCase()))
    const stockByCode = new Map(existingCodes.map((row) => [row.stockCode.trim().toLowerCase(), row]))
    // A mistyped code is matched against both codes and product names, so a
    // row that names the product instead of its code still gets pointed at it.
    const productCandidates = products.map((product) => ({
      name: product.productCode,
      detail: product.name,
      aliases: [product.name],
    }))
    let highestCode = existingCodes.reduce((max, row) => {
      const match = /^STK-(?:\d{4}-)?(\d+)$/.exec(row.stockCode)
      return match ? Math.max(max, Number(match[1])) : max
    }, 0)
    const year = new Date().getFullYear()
    const nextAutoCode = () => {
      let code: string
      do {
        highestCode += 1
        code = `STK-${year}-${String(highestCode).padStart(4, "0")}`
      } while (usedCodes.has(code.toLowerCase()))
      return code
    }

    const errors: string[] = []
    const toCreate: Prisma.InventoryStockCreateManyInput[] = []
    const ledgerRows: Prisma.LedgerEntryCreateManyInput[] = []
    // Rows of pieces whose Product has several metals / stones — same as
    // Add Stock (newStockPieceRows); the stock id is set here so they can be
    // written with createMany in the same transaction.
    const componentRows: Prisma.PieceComponentCreateManyInput[] = []
    const gstById = products.some((product) => product.metalComponents.length > 1 || product.stoneComponents.length > 1)
      ? new Map(
          (await prisma.gstRate.findMany({ where: { storeId }, select: { id: true, name: true, ratePercent: true } })).map(
            (rate) => [rate.id, rate],
          ),
        )
      : new Map<string, { name: string; ratePercent: Prisma.Decimal }>()

    for (const [index, row] of rows.entries()) {
      // +2 = one for the header row, one for 1-based spreadsheet numbering.
      const line = index + 2
      const rowErrors: string[] = []
      const number = (column: string) => {
        const raw = stockImportCell(row, column).replace(/,/g, "")
        if (!raw) return null
        const value = Number(raw)
        if (!Number.isFinite(value) || value < 0) {
          rowErrors.push(`${column} must be a number, 0 or more`)
          return null
        }
        return value
      }

      // Stock is only ever added against a product that already exists.
      const productCode = stockImportCell(row, "Product Code")
      const product = productCode ? productByCode.get(productCode.toLowerCase()) : undefined
      if (!productCode) {
        errors.push(`Row ${line}: Product Code is required`)
        continue
      }
      if (!product) {
        errors.push(
          `Row ${line}: No product found with code "${productCode}"${
            suggestFrom(productCode, productCandidates, { listUpTo: 0 }) ||
            `${IMPORT_SUGGESTION_MARK}Add the product first, or check the code on the Products page`
          }`,
        )
        continue
      }
      if (!product.metalTypeId) {
        errors.push(`Row ${line}: "${productCode}" has no metal set — add one on the product first`)
        continue
      }

      const typedCode = stockImportCell(row, "Stock Code")
      if (typedCode && usedCodes.has(typedCode.toLowerCase())) {
        const owner = stockByCode.get(typedCode.toLowerCase())
        rowErrors.push(
          `Stock Code "${typedCode}" already exists${existingRecordHint(
            { name: typedCode, detail: owner?.product ? `${owner.product.name} (ref ${owner.product.productCode})` : null },
            "Leave Stock Code blank for an automatic one, or remove this row if it's the same piece",
          )}`,
        )
      }

      const statusRaw = stockImportCell(row, "Status")
      const status = statusRaw ? parseImportStockStatus(statusRaw) : InventoryStockStatus.IN_STOCK
      if (!status) rowErrors.push(`"${statusRaw}" is not an importable Status — use In Stock, Reserved or Damaged`)

      const finishRaw = stockImportCell(row, "Finish")
      const finish = finishRaw ? parseFinishLabel(finishRaw) : product.defaultFinish
      if (!finish) rowErrors.push(`"${finishRaw}" is not a valid Finish — use Unfinished or Finished, or leave it blank`)

      const quantityRaw = stockImportCell(row, "Quantity")
      const quantity = quantityRaw ? Number(quantityRaw) : 1
      if (!Number.isInteger(quantity) || quantity < 1) rowErrors.push("Quantity must be a whole number, 1 or more")

      // Weights: blank takes the product's typical weight, the way the Add
      // Stock form pre-fills them; a blank Net is Gross − Less − Stone once
      // any of those is given on the row (the form's own auto-calculation).
      const grossTyped = number("Gross Weight (g)")
      const lessWeight = number("Less Weight (g)")
      const stoneTyped = number("Stone Weight (g)")
      const caratTyped = number("Carat Weight (ct)")
      const netTyped = number("Net Weight (g)")
      const decimalOrNull = (value: { toString(): string } | null) => (value == null ? null : Number(value))
      const grossWeight = grossTyped ?? decimalOrNull(product.defaultGrossWeight)
      const stoneWeight = stoneTyped ?? decimalOrNull(product.defaultStoneWeight)
      const caratWeight = caratTyped ?? decimalOrNull(product.defaultCaratWeight)
      const netWeight =
        netTyped ??
        (grossTyped !== null || lessWeight !== null || stoneTyped !== null
          ? grossWeight !== null
            ? Number(Math.max(0, grossWeight - (lessWeight ?? 0) - (stoneWeight ?? 0)).toFixed(5))
            : null
          : decimalOrNull(product.defaultNetWeight))
      if (grossWeight === null) rowErrors.push("Gross Weight (g) is required (the product has none to fall back on)")
      if (netWeight === null) rowErrors.push("Net Weight (g) is required (the product has none to fall back on)")

      const purchaseRate = number("Purchase Rate")
      const saleRate = number("Sale Rate")
      const otherCharge = number("Other Charge")
      const purchaseAmount = number("Purchase Amount")
      const saleAmount = number("Sale Amount")

      const dateCell = (column: string) => {
        const raw = stockImportCell(row, column)
        if (!raw) return null
        const date = parseSheetDate(raw)
        if (!date) rowErrors.push(`${column} "${raw}" is not a date — use DD/MM/YYYY`)
        return date
      }
      const purchaseDate = dateCell("Purchase Date")
      const manufactureDate = dateCell("Date of Manufacture")

      const locationName = stockImportCell(row, "Location")
      let resolvedLocationId: string | null = null
      const requestedLocationId = locationName ? (locationByName.get(locationName.toLowerCase()) ?? null) : null
      if (locationName && !requestedLocationId) {
        rowErrors.push(`No location found named "${locationName}"${suggestFrom(locationName, namesAsCandidates(locations.map((l) => l.name)))}`)
      } else {
        const resolution = await resolveWritableLocationId(storeId, requestedLocationId, locationScope)
        if (!resolution.ok) rowErrors.push(resolution.message)
        else resolvedLocationId = resolution.locationId
      }

      if (rowErrors.length > 0) {
        for (const message of rowErrors) errors.push(`Row ${line}: ${message}`)
        continue
      }

      const stockCode = typedCode || nextAutoCode()
      usedCodes.add(stockCode.toLowerCase())
      const tagNumber = stockImportCell(row, "Tag Number") || null
      const purityLabel = product.storeMetalPurity?.label ?? null
      // Same stone-charge rule as createInventoryStock: a product with a
      // stone rate charges this piece's own carats × that rate.
      const stoneCharge =
        product.hasStoneComponent && product.defaultStoneRate != null && caratWeight
          ? new Prisma.Decimal(product.defaultStoneRate).mul(caratWeight)
          : product.defaultStoneCharge
      const pieceRows = newStockPieceRows(product, { netWeight, caratWeight }, { fineOf, gstById })
      const fineWeight = pieceRows
        ? pieceRows.fineWeight
        : fineOf({ metalTypeId: product.metalTypeId, purity: product.defaultPurity, purityLabel, netWeight })
      const stockId = randomUUID()
      if (pieceRows) {
        for (const component of pieceRows.components) componentRows.push({ ...component, inventoryStockId: stockId })
      }

      toCreate.push({
        id: stockId,
        storeId,
        productId: product.id,
        stockCode,
        tagNumber,
        status: status!,
        finish: finish!,
        quantity,
        metalTypeId: product.metalTypeId,
        purity: product.defaultPurity,
        purityLabel,
        grossWeight: grossWeight!,
        lessWeight,
        netWeight: netWeight!,
        fineWeight,
        stoneWeight,
        caratWeight,
        purchaseRate,
        saleRate,
        makingCharge: product.defaultMakingCharge,
        makingChargeType: product.defaultMakingChargeType,
        stoneCharge: pieceRows ? pieceRows.stoneCharge : stoneCharge,
        stoneRate: product.hasStoneComponent ? product.defaultStoneRate : null,
        stoneMetalTypeName: product.hasStoneComponent ? product.defaultStoneMetalTypeName : null,
        stoneTypeNames: product.hasStoneComponent ? product.defaultStoneTypeNames : null,
        otherCharge,
        purchaseAmount,
        saleAmount,
        vendorName: stockImportCell(row, "Vendor Name") || null,
        purchaseDate,
        manufactureDate,
        locationId: resolvedLocationId,
        remarks: stockImportCell(row, "Remarks") || null,
        createdById: currentUser?.id ?? undefined,
        createdByName: currentUser?.name ?? undefined,
        createdByRole: currentUser?.role ?? undefined,
      })

      // Same ledger entries Add Stock posts, so imported gold shows on the
      // Ledger — one per metal for a piece of several.
      if (pieceRows) {
        for (const metal of pieceRows.metals) {
          const hasPurity = metalHasPurity.get(metal.metalTypeId) ?? false
          ledgerRows.push({
            storeId,
            type: LedgerEntryType.DEBIT,
            sourceType: LedgerSourceType.ADJUSTMENT,
            metalTypeId: metal.metalTypeId,
            metalWeight: hasPurity ? undefined : metal.netWeight,
            metalWeightFine: hasPurity && metal.fineWeight ? metal.fineWeight : undefined,
            amount: 0,
            description: `Stock added — ${stockCode}${tagNumber ? ` (Tag ${tagNumber})` : ""} (import)`,
            locationId: resolvedLocationId ?? undefined,
          })
        }
      } else if (netWeight && netWeight > 0) {
        const hasPurity = metalHasPurity.get(product.metalTypeId) ?? false
        ledgerRows.push({
          storeId,
          type: LedgerEntryType.DEBIT,
          sourceType: LedgerSourceType.ADJUSTMENT,
          metalTypeId: product.metalTypeId,
          metalWeight: hasPurity ? undefined : netWeight,
          metalWeightFine: hasPurity && fineWeight ? fineWeight : undefined,
          amount: 0,
          description: `Stock added — ${stockCode}${tagNumber ? ` (Tag ${tagNumber})` : ""} (import)`,
          locationId: resolvedLocationId ?? undefined,
        })
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        message: "Nothing was imported. Fix these rows and try again.",
        errors,
      }
    }

    if (!toCreate.length) {
      return { success: false, message: "That file has no rows to import." }
    }

    await prisma.$transaction([
      prisma.inventoryStock.createMany({ data: toCreate }),
      ...(componentRows.length ? [prisma.pieceComponent.createMany({ data: componentRows })] : []),
      ...(ledgerRows.length ? [prisma.ledgerEntry.createMany({ data: ledgerRows })] : []),
    ])

    revalidatePath("/inventory")
    revalidatePath("/inventory/stock")
    revalidatePath("/ledger")

    return {
      success: true,
      message: `Added ${toCreate.length} stock ${toCreate.length === 1 ? "entry" : "entries"}.`,
      createdCount: toCreate.length,
    }
  } catch (error) {
    logger.error("importInventoryStockFromExcel error", error)
    return { success: false, message: actionErrorMessage(error, "Failed to import stock.") }
  }
}