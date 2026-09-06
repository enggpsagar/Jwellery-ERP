// lib/actions/inventory/stock-actions.ts
"use server"

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
import { requireStoreScope } from "@/lib/store-context"
import {
  getLocationScope,
  locationWhere,
  isLocationAllowed,
  resolveWritableLocationId,
  type LocationScope,
} from "@/lib/location-scope"
import type { StockFormState } from "@/lib/inventory/stock-types"
import { buildExcelExport, buildMultiSheetExcelExport, parseExcelUpload } from "@/lib/excel-export"
import { UNASSIGNED_METAL_TYPE } from "@/lib/business-units"
import { getFinenessMap, toFineWeight } from "@/lib/purity"

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

function parseBoolean(value: FormDataEntryValue | null) {
  return String(value || "") === "true"
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
}

type ExportInventoryStockParams = {
  selectedIds?: string[]
  search?: string
  sortBy?: string
  sortOrder?: StockSortOrder
  type?: string
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
) {
  const query = String(search || "").trim()

  return {
    storeId,
    ...locationWhere(scope),
    ...(metalTypeId === UNASSIGNED_METAL_TYPE
      ? { metalTypeId: null }
      : metalTypeId
        ? { metalTypeId }
        : {}),
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
  if (sortBy === "stockCode") return { stockCode: sortOrder }
  if (sortBy === "netWeight") return { netWeight: sortOrder }
  if (sortBy === "saleAmount") return { saleAmount: sortOrder }
  if (sortBy === "product") return { product: { name: sortOrder } }
  if (sortBy === "metalType") return { metalType: { name: sortOrder } }
  if (sortBy === "purity") return { purity: sortOrder }
  if (sortBy === "quantity") return { quantity: sortOrder }
  if (sortBy === "status") return { status: sortOrder }
  if (sortBy === "finish") return { finish: sortOrder }
  if (sortBy === "location") return { location: { name: sortOrder } }
  if (sortBy === "purchaseDate") return { purchaseDate: sortOrder }
  return { createdAt: sortOrder }
}

function mapStockRow(row: any) {
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
  const where = getStockWhere(storeId, search, scope, params.metalTypeId)
  const orderBy = getStockOrderBy(sortBy, sortOrder)

  const [totalCount, rows] = await Promise.all([
    prisma.inventoryStock.count({ where }),
    prisma.inventoryStock.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: STOCK_INCLUDE,
    }),
  ])

  const stockItems = rows.map(mapStockRow)
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return {
    stockItems,
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
    : getStockWhere(storeId, params.search, scope, params.type)

  const rows = await prisma.inventoryStock.findMany({
    where,
    orderBy: getStockOrderBy(sortBy, sortOrder),
    include: STOCK_INCLUDE,
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

    const rows = stockItems.map((item, index) => ({
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
      "Purchase Rate": item.purchaseRate || "-",
      "Sale Rate": item.saleRate || "-",
      "Making Charge": item.makingCharge || "-",
      "Purchase Amount": item.purchaseAmount || "-",
      "Sale Amount": item.saleAmount || "-",
      Status: item.status || "-",
      Finish: item.finish || "-",
      Location: item.location?.name || "-",
      "Vendor Name": item.vendorName || "-",
      "Purchase Date": item.purchaseDate
        ? new Date(item.purchaseDate).toLocaleDateString("en-IN")
        : "-",
      "Created At": item.createdAt
        ? new Date(item.createdAt).toLocaleString("en-IN")
        : "-",
    }))

    const { fileName, fileBase64 } = buildExcelExport(
      rows,
      "Inventory Stock",
      "inventory-stock"
    )

    return {
      success: true,
      message: "Stock exported successfully.",
      fileName,
      fileBase64,
    }
  } catch (error) {
    console.error("exportInventoryStockToExcel error:", error)
    return {
      success: false,
      message: "Failed to export stock.",
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

export async function getInventoryStockById(id: string) {
  const storeId = await requireStoreScope()

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
      invoiceItems: {
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              invoiceDate: true,
              customer: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      karigarJobs: {
        include: {
          karigar: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
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
    const isActive = parseBoolean(formData.get("isActive"))

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

    let metalWeightFine: number | undefined
    if (storeMetal?.hasPurity && purity && netWeight) {
      const fineness = await getFinenessMap(storeId)
      metalWeightFine = toFineWeight(netWeight, purity, fineness)
    }

    await prisma.$transaction([
      prisma.inventoryStock.create({
        data: {
          storeId,
          productId,
          stockCode,
          tagNumber,
          metalTypeId,
          purity,
          status,
          finish,
          quantity,
          isActive,
          grossWeight: toDecimal(grossWeight),
          lessWeight: toDecimal(lessWeight),
          netWeight: toDecimal(netWeight),
          stoneWeight: toDecimal(stoneWeight),
          caratWeight: toDecimal(caratWeight),
          dmoWeight: toDecimal(dmoWeight),
          wastagePercent: toDecimal(wastagePercent),
          purchaseRate: toDecimal(purchaseRate),
          saleRate: toDecimal(saleRate),
          makingCharge,
          makingChargeType,
          stoneCharge,
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
        },
      }),
      ...(netWeight && netWeight > 0
        ? [
            prisma.ledgerEntry.create({
              data: {
                storeId,
                type: LedgerEntryType.DEBIT,
                sourceType: LedgerSourceType.ADJUSTMENT,
                metalTypeId,
                metalWeight: storeMetal?.hasPurity ? undefined : netWeight,
                metalWeightFine,
                amount: 0,
                description: `Stock added — ${stockCode}${tagNumber ? ` (Tag ${tagNumber})` : ""}`,
                locationId: locationId ?? undefined,
              },
            }),
          ]
        : []),
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
    console.error("createInventoryStock error:", error)
    return {
      success: false,
      message: "Failed to add stock",
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
    const isActive = parseBoolean(formData.get("isActive"))

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
          isActive,
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
          "Stock updated successfully. Some core fields were locked because this stock is already linked to invoice / karigar records.",
        errors: {},
      }
    }

    await prisma.inventoryStock.update({
      where: { id },
      data: {
        productId,
        stockCode,
        tagNumber,
        metalTypeId,
        purity,
        status,
        finish,
        quantity,
        isActive,
        grossWeight: toDecimal(grossWeight),
        lessWeight: toDecimal(lessWeight),
        netWeight: toDecimal(netWeight),
        stoneWeight: toDecimal(stoneWeight),
        caratWeight: toDecimal(caratWeight),
        dmoWeight: toDecimal(dmoWeight),
        wastagePercent: toDecimal(wastagePercent),
        purchaseRate: toDecimal(purchaseRate),
        saleRate: toDecimal(saleRate),
        makingCharge,
        makingChargeType,
        stoneCharge,
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
    })

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
    console.error("updateInventoryStock error:", error)
    return {
      success: false,
      message: "Failed to update stock",
      errors: {},
    }
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
          "This stock cannot be deleted because it is already linked to invoice or karigar records.",
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
    console.error("deleteInventoryStock error:", error)
    return {
      success: false,
      message: "Failed to delete stock",
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

/**
 * A downloadable .xlsx showing the expected columns and one filled-in
 * example row. Only Product Code and Quantity are required — everything
 * else a stock entry needs (metal, purity, making/stone charges) comes from
 * the matched product, same as the single "Stock entry" checkbox on Product
 * Create ("needs nothing but a quantity").
 */
export async function getStockImportTemplate(): Promise<{
  fileName: string
  fileBase64: string
}> {
  await requireStoreScope()

  const example = {
    "Product Code": "PRD-0001",
    Quantity: 5,
    Location: "",
  }

  return buildMultiSheetExcelExport(
    [{ name: "Stock Import", rows: [example], columns: Object.keys(example) }],
    "stock-import-template",
  )
}

function stockImportCell(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim()
}

/**
 * Bulk-adds stock quantity across many products from one spreadsheet —
 * the "multi-row form" alternative: one row per product, Product Code +
 * Quantity (+ optional Location), instead of repeating the single Add Stock
 * form by hand for every product. Each row becomes its own new
 * InventoryStock row (a fresh stock code, quantity from the sheet) rather
 * than incrementing an existing one, matching how "Add Stock" always
 * creates a new row too.
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

    const rows = parseExcelUpload(await file.arrayBuffer())

    if (!rows.length) {
      return { success: false, message: "That file has no rows to import." }
    }

    const [products, locations, existingCodes] = await Promise.all([
      prisma.product.findMany({
        where: { storeId },
        select: {
          id: true,
          productCode: true,
          metalTypeId: true,
          defaultPurity: true,
          defaultMakingCharge: true,
          defaultMakingChargeType: true,
          defaultStoneCharge: true,
          defaultStoneRate: true,
          hasStoneComponent: true,
          defaultStoneMetalTypeName: true,
          defaultStoneTypeNames: true,
        },
      }),
      prisma.storeLocation.findMany({ where: { storeId }, select: { id: true, name: true } }),
      prisma.inventoryStock.findMany({
        where: { storeId, stockCode: { startsWith: "STK-" } },
        select: { stockCode: true },
      }),
    ])

    const productByCode = new Map(
      products.map((product) => [product.productCode.trim().toLowerCase(), product]),
    )
    const locationByName = new Map(
      locations.map((location) => [location.name.trim().toLowerCase(), location.id]),
    )
    const locationScope = await getLocationScope()

    let highestCode = existingCodes.reduce((max, row) => {
      const match = /^STK-(?:\d{4}-)?(\d+)$/.exec(row.stockCode)
      return match ? Math.max(max, Number(match[1])) : max
    }, 0)
    const year = new Date().getFullYear()

    const errors: string[] = []
    const toCreate: Prisma.InventoryStockCreateManyInput[] = []

    for (const [index, row] of rows.entries()) {
      // +2 = one for the header row, one for 1-based spreadsheet numbering.
      const line = index + 2
      const productCode = stockImportCell(row, "Product Code")

      if (!productCode) {
        errors.push(`Row ${line}: Product Code is required`)
        continue
      }

      const product = productByCode.get(productCode.trim().toLowerCase())
      if (!product) {
        errors.push(`Row ${line}: No product found with code "${productCode}"`)
        continue
      }

      if (!product.metalTypeId) {
        errors.push(
          `Row ${line}: "${productCode}" has no metal set — add one on the product first`,
        )
        continue
      }

      const rawQuantity = stockImportCell(row, "Quantity")
      const quantity = rawQuantity === "" ? 0 : Number(rawQuantity)
      if (!Number.isFinite(quantity) || quantity < 0) {
        errors.push(`Row ${line}: Quantity must be 0 or more`)
        continue
      }

      const locationName = stockImportCell(row, "Location")
      let resolvedLocationId: string | null = null
      if (locationName) {
        const matchedLocationId = locationByName.get(locationName.trim().toLowerCase())
        if (!matchedLocationId) {
          errors.push(`Row ${line}: No location found named "${locationName}"`)
          continue
        }
        const resolution = await resolveWritableLocationId(storeId, matchedLocationId, locationScope)
        if (!resolution.ok) {
          errors.push(`Row ${line}: ${resolution.message}`)
          continue
        }
        resolvedLocationId = resolution.locationId
      } else {
        const resolution = await resolveWritableLocationId(storeId, null, locationScope)
        if (!resolution.ok) {
          errors.push(`Row ${line}: ${resolution.message}`)
          continue
        }
        resolvedLocationId = resolution.locationId
      }

      highestCode += 1

      toCreate.push({
        storeId,
        productId: product.id,
        stockCode: `STK-${year}-${String(highestCode).padStart(4, "0")}`,
        quantity: Math.trunc(quantity),
        metalTypeId: product.metalTypeId,
        purity: product.defaultPurity,
        makingCharge: product.defaultMakingCharge ?? undefined,
        makingChargeType: product.defaultMakingChargeType,
        stoneCharge: product.hasStoneComponent ? product.defaultStoneCharge ?? undefined : undefined,
        stoneRate: product.hasStoneComponent ? product.defaultStoneRate ?? undefined : undefined,
        stoneMetalTypeName: product.hasStoneComponent
          ? product.defaultStoneMetalTypeName ?? undefined
          : undefined,
        stoneTypeNames: product.hasStoneComponent
          ? product.defaultStoneTypeNames ?? undefined
          : undefined,
        locationId: resolvedLocationId ?? undefined,
        createdById: currentUser?.id ?? undefined,
        createdByName: currentUser?.name ?? undefined,
        createdByRole: currentUser?.role ?? undefined,
      })
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

    await prisma.inventoryStock.createMany({ data: toCreate })

    revalidatePath("/inventory")
    revalidatePath("/inventory/stock")

    return {
      success: true,
      message: `Added ${toCreate.length} stock ${toCreate.length === 1 ? "entry" : "entries"}.`,
      createdCount: toCreate.length,
    }
  } catch (error) {
    console.error("importInventoryStockFromExcel error:", error)
    return { success: false, message: "Failed to import stock." }
  }
}