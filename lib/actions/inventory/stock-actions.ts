// lib/actions/inventory/stock-actions.ts
"use server"

import { revalidatePath } from "next/cache"
import {
  InventoryStockStatus,
  InventoryFinish,
  PurityType,
  ChargeType,
  Prisma,
} from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"
import type { StockFormState } from "@/lib/inventory/stock-types"
import { buildExcelExport } from "@/lib/excel-export"

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

export type StockSortBy = "createdAt" | "stockCode" | "netWeight" | "saleAmount"
export type StockSortOrder = "asc" | "desc"

export type GetInventoryStockParams = {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: StockSortBy
  sortOrder?: StockSortOrder
}

type ExportInventoryStockParams = {
  selectedIds?: string[]
  search?: string
  sortBy?: string
  sortOrder?: StockSortOrder
}

const STOCK_INCLUDE = {
  metalType: {
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

function getStockWhere(storeId: string, search?: string) {
  const query = String(search || "").trim()

  return {
    storeId,
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
  return { createdAt: sortOrder }
}

function mapStockRow(row: any) {
  return {
    ...row,
    grossWeight: row.grossWeight?.toString() ?? null,
    lessWeight: row.lessWeight?.toString() ?? null,
    netWeight: row.netWeight?.toString() ?? null,
    stoneWeight: row.stoneWeight?.toString() ?? null,
    dmoWeight: row.dmoWeight?.toString() ?? null,
    wastagePercent: row.wastagePercent?.toString() ?? null,
    purchaseRate: row.purchaseRate?.toString() ?? null,
    saleRate: row.saleRate?.toString() ?? null,
    makingCharge: row.makingCharge?.toString() ?? null,
    stoneCharge: row.stoneCharge?.toString() ?? null,
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
  const where = getStockWhere(storeId, search)
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
  const validSortBy: StockSortBy[] = ["createdAt", "stockCode", "netWeight", "saleAmount"]
  const sortBy: StockSortBy = validSortBy.includes(params.sortBy as StockSortBy)
    ? (params.sortBy as StockSortBy)
    : "createdAt"
  const sortOrder: StockSortOrder = params.sortOrder || "desc"

  const storeId = await requireStoreScope()
  const where = params.selectedIds?.length
    ? {
        id: { in: params.selectedIds },
        storeId,
      }
    : getStockWhere(storeId, params.search)

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
      "Purchase Rate": item.purchaseRate || "-",
      "Sale Rate": item.saleRate || "-",
      "Making Charge": item.makingCharge || "-",
      "Purchase Amount": item.purchaseAmount || "-",
      "Sale Amount": item.saleAmount || "-",
      Status: item.status || "-",
      Finish: item.finish || "-",
      Location: item.location || "-",
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
    dmoWeight: row.dmoWeight?.toString() ?? null,
    wastagePercent: row.wastagePercent?.toString() ?? null,
    purchaseRate: row.purchaseRate?.toString() ?? null,
    saleRate: row.saleRate?.toString() ?? null,
    makingCharge: row.makingCharge?.toString() ?? null,
    stoneCharge: row.stoneCharge?.toString() ?? null,
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

    const metalTypeId = String(formData.get("metalTypeId") || "").trim()

    const purity = parseOptionalEnum(
      formData.get("purity"),
      Object.values(PurityType)
    ) as PurityType | null

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
    const dmoWeight = parseOptionalNumber(formData.get("dmoWeight"))
    const wastagePercent = parseOptionalNumber(formData.get("wastagePercent"))

    const purchaseRate = parseOptionalNumber(formData.get("purchaseRate"))
    const saleRate = parseOptionalNumber(formData.get("saleRate"))
    const makingCharge = parseOptionalNumber(formData.get("makingCharge"))
    const makingChargeType = parseChargeType(formData.get("makingChargeType"))
    const stoneCharge = parseOptionalNumber(formData.get("stoneCharge"))
    const otherCharge = parseOptionalNumber(formData.get("otherCharge"))
    const purchaseAmount = parseOptionalNumber(formData.get("purchaseAmount"))
    const saleAmount = parseOptionalNumber(formData.get("saleAmount"))

    const vendorName = parseNullableString(formData.get("vendorName"))
    const location = parseNullableString(formData.get("location"))
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

    if (!metalTypeId) {
      errors.metalTypeId = ["Metal type is required"]
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

    const product = await prisma.product.findFirst({
      where: { id: productId, storeId },
      select: { id: true },
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

    const metalType = await prisma.storeMetal.findFirst({
      where: { id: metalTypeId, storeId },
      select: { id: true },
    })

    if (!metalType) {
      return {
        success: false,
        message: "Selected metal type is invalid",
        errors: {
          metalTypeId: ["Selected metal type could not be found"],
        },
      }
    }

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

    await prisma.inventoryStock.create({
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
        dmoWeight: toDecimal(dmoWeight),
        wastagePercent: toDecimal(wastagePercent),
        purchaseRate: toDecimal(purchaseRate),
        saleRate: toDecimal(saleRate),
        makingCharge: toDecimal(makingCharge),
        makingChargeType,
        stoneCharge: toDecimal(stoneCharge),
        otherCharge: toDecimal(otherCharge),
        purchaseAmount: toDecimal(purchaseAmount),
        saleAmount: toDecimal(saleAmount),
        vendorName,
        purchaseDate,
        manufactureDate,
        location,
        remarks,
      },
    })

    revalidatePath("/inventory")
    revalidatePath("/inventory/stock")

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

    const metalTypeId = String(formData.get("metalTypeId") || "").trim()

    const purity = parseOptionalEnum(
      formData.get("purity"),
      Object.values(PurityType)
    ) as PurityType | null

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
    const dmoWeight = parseOptionalNumber(formData.get("dmoWeight"))
    const wastagePercent = parseOptionalNumber(formData.get("wastagePercent"))

    const purchaseRate = parseOptionalNumber(formData.get("purchaseRate"))
    const saleRate = parseOptionalNumber(formData.get("saleRate"))
    const makingCharge = parseOptionalNumber(formData.get("makingCharge"))
    const makingChargeType = parseChargeType(formData.get("makingChargeType"))
    const stoneCharge = parseOptionalNumber(formData.get("stoneCharge"))
    const otherCharge = parseOptionalNumber(formData.get("otherCharge"))
    const purchaseAmount = parseOptionalNumber(formData.get("purchaseAmount"))
    const saleAmount = parseOptionalNumber(formData.get("saleAmount"))

    const vendorName = parseNullableString(formData.get("vendorName"))
    const location = parseNullableString(formData.get("location"))
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

    if (!metalTypeId) {
      errors.metalTypeId = ["Metal type is required"]
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

    if (!isLockedForCoreChanges) {
      const product = await prisma.product.findFirst({
        where: { id: productId, storeId },
        select: { id: true },
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

      const metalType = await prisma.storeMetal.findFirst({
        where: { id: metalTypeId, storeId },
        select: { id: true },
      })

      if (!metalType) {
        return {
          success: false,
          message: "Selected metal type is invalid",
          errors: {
            metalTypeId: ["Selected metal type could not be found"],
          },
        }
      }
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
          location,
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
        dmoWeight: toDecimal(dmoWeight),
        wastagePercent: toDecimal(wastagePercent),
        purchaseRate: toDecimal(purchaseRate),
        saleRate: toDecimal(saleRate),
        makingCharge: toDecimal(makingCharge),
        makingChargeType,
        stoneCharge: toDecimal(stoneCharge),
        otherCharge: toDecimal(otherCharge),
        purchaseAmount: toDecimal(purchaseAmount),
        saleAmount: toDecimal(saleAmount),
        vendorName,
        purchaseDate,
        manufactureDate,
        location,
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