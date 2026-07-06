// lib/actions/inventory/stock-actions.ts
"use server"

import { revalidatePath } from "next/cache"
import {
  InventoryStockStatus,
  MetalType,
  PurityType,
  Prisma,
} from "@prisma/client"

import { prisma } from "@/lib/prisma"
import type { StockFormState } from "@/lib/inventory/stock-types"

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

function toDecimal(value: number | null | undefined): Prisma.Decimal | undefined {
  if (value === null || value === undefined) return undefined
  return new Prisma.Decimal(value)
}

export async function getInventoryStock() {
  const rows = await prisma.inventoryStock.findMany({
    include: {
      product: {
        select: {
          id: true,
          productCode: true,
          name: true,
          category: true,
          ornamentType: true,
          metalType: true,
          defaultPurity: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return rows.map((row) => ({
    ...row,
    grossWeight: row.grossWeight?.toString() ?? null,
    lessWeight: row.lessWeight?.toString() ?? null,
    netWeight: row.netWeight?.toString() ?? null,
    stoneWeight: row.stoneWeight?.toString() ?? null,
    wastagePercent: row.wastagePercent?.toString() ?? null,
    purchaseRate: row.purchaseRate?.toString() ?? null,
    saleRate: row.saleRate?.toString() ?? null,
    makingCharge: row.makingCharge?.toString() ?? null,
    stoneCharge: row.stoneCharge?.toString() ?? null,
    otherCharge: row.otherCharge?.toString() ?? null,
    purchaseAmount: row.purchaseAmount?.toString() ?? null,
    saleAmount: row.saleAmount?.toString() ?? null,
  }))
}
export async function getInventoryStockFormProducts() {
  const products = await prisma.product.findMany({
    where: {
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
      category: true,
      ornamentType: true,
      metalType: true,
      defaultPurity: true,
      isActive: true,
    },
  })

  return products.map((product) => ({
    ...product,
    category: product.category ?? null,
    ornamentType: product.ornamentType ?? null,
    metalType: product.metalType ?? null,
    defaultPurity: product.defaultPurity ?? null,
  }))
}

export async function getInventoryStockById(id: string) {
  const row = await prisma.inventoryStock.findUnique({
    where: { id },
    include: {
      product: {
        select: {
          id: true,
          productCode: true,
          name: true,
          category: true,
          ornamentType: true,
          metalType: true,
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

    const metalType =
      (parseOptionalEnum(
        formData.get("metalType"),
        Object.values(MetalType)
      ) as MetalType | null) ?? MetalType.GOLD

    const purity = parseOptionalEnum(
      formData.get("purity"),
      Object.values(PurityType)
    ) as PurityType | null

    const status =
      (parseOptionalEnum(
        formData.get("status"),
        Object.values(InventoryStockStatus)
      ) as InventoryStockStatus | null) ?? InventoryStockStatus.IN_STOCK

    const quantity = parseOptionalInt(formData.get("quantity")) ?? 1
    const isActive = parseBoolean(formData.get("isActive"))

    const grossWeight = parseOptionalNumber(formData.get("grossWeight"))
    const lessWeight = parseOptionalNumber(formData.get("lessWeight"))
    const netWeight = parseOptionalNumber(formData.get("netWeight"))
    const stoneWeight = parseOptionalNumber(formData.get("stoneWeight"))
    const wastagePercent = parseOptionalNumber(formData.get("wastagePercent"))

    const purchaseRate = parseOptionalNumber(formData.get("purchaseRate"))
    const saleRate = parseOptionalNumber(formData.get("saleRate"))
    const makingCharge = parseOptionalNumber(formData.get("makingCharge"))
    const stoneCharge = parseOptionalNumber(formData.get("stoneCharge"))
    const otherCharge = parseOptionalNumber(formData.get("otherCharge"))
    const purchaseAmount = parseOptionalNumber(formData.get("purchaseAmount"))
    const saleAmount = parseOptionalNumber(formData.get("saleAmount"))

    const vendorName = parseNullableString(formData.get("vendorName"))
    const location = parseNullableString(formData.get("location"))
    const remarks = parseNullableString(formData.get("remarks"))

    const purchaseDateValue = String(formData.get("purchaseDate") || "").trim()
    const purchaseDate = purchaseDateValue ? new Date(purchaseDateValue) : null

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

    const existing = await prisma.inventoryStock.findUnique({
      where: { stockCode },
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
        productId,
        stockCode,
        tagNumber,
        metalType,
        purity,
        status,
        quantity,
        isActive,
        grossWeight: toDecimal(grossWeight),
        lessWeight: toDecimal(lessWeight),
        netWeight: toDecimal(netWeight),
        stoneWeight: toDecimal(stoneWeight),
        wastagePercent: toDecimal(wastagePercent),
        purchaseRate: toDecimal(purchaseRate),
        saleRate: toDecimal(saleRate),
        makingCharge: toDecimal(makingCharge),
        stoneCharge: toDecimal(stoneCharge),
        otherCharge: toDecimal(otherCharge),
        purchaseAmount: toDecimal(purchaseAmount),
        saleAmount: toDecimal(saleAmount),
        vendorName,
        purchaseDate,
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
    const existingStock = await prisma.inventoryStock.findUnique({
      where: { id },
      select: {
        id: true,
        invoiceItems: {
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
      existingStock.invoiceItems.length > 0 || existingStock.karigarJobs.length > 0

    const productId = String(formData.get("productId") || "").trim()
    const stockCode = String(formData.get("stockCode") || "").trim()
    const tagNumber = parseNullableString(formData.get("tagNumber"))

    const metalType =
      (parseOptionalEnum(
        formData.get("metalType"),
        Object.values(MetalType)
      ) as MetalType | null) ?? MetalType.GOLD

    const purity = parseOptionalEnum(
      formData.get("purity"),
      Object.values(PurityType)
    ) as PurityType | null

    const status =
      (parseOptionalEnum(
        formData.get("status"),
        Object.values(InventoryStockStatus)
      ) as InventoryStockStatus | null) ?? InventoryStockStatus.IN_STOCK

    const quantity = parseOptionalInt(formData.get("quantity")) ?? 1
    const isActive = parseBoolean(formData.get("isActive"))

    const grossWeight = parseOptionalNumber(formData.get("grossWeight"))
    const lessWeight = parseOptionalNumber(formData.get("lessWeight"))
    const netWeight = parseOptionalNumber(formData.get("netWeight"))
    const stoneWeight = parseOptionalNumber(formData.get("stoneWeight"))
    const wastagePercent = parseOptionalNumber(formData.get("wastagePercent"))

    const purchaseRate = parseOptionalNumber(formData.get("purchaseRate"))
    const saleRate = parseOptionalNumber(formData.get("saleRate"))
    const makingCharge = parseOptionalNumber(formData.get("makingCharge"))
    const stoneCharge = parseOptionalNumber(formData.get("stoneCharge"))
    const otherCharge = parseOptionalNumber(formData.get("otherCharge"))
    const purchaseAmount = parseOptionalNumber(formData.get("purchaseAmount"))
    const saleAmount = parseOptionalNumber(formData.get("saleAmount"))

    const vendorName = parseNullableString(formData.get("vendorName"))
    const location = parseNullableString(formData.get("location"))
    const remarks = parseNullableString(formData.get("remarks"))

    const purchaseDateValue = String(formData.get("purchaseDate") || "").trim()
    const purchaseDate = purchaseDateValue ? new Date(purchaseDateValue) : null

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

    /**
     * If stock is already linked to invoice / karigar jobs,
     * block changes to structural fields that can break history.
     */
    if (isLockedForCoreChanges) {
      await prisma.inventoryStock.update({
        where: { id },
        data: {
          status,
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
        metalType,
        purity,
        status,
        quantity,
        isActive,
        grossWeight: toDecimal(grossWeight),
        lessWeight: toDecimal(lessWeight),
        netWeight: toDecimal(netWeight),
        stoneWeight: toDecimal(stoneWeight),
        wastagePercent: toDecimal(wastagePercent),
        purchaseRate: toDecimal(purchaseRate),
        saleRate: toDecimal(saleRate),
        makingCharge: toDecimal(makingCharge),
        stoneCharge: toDecimal(stoneCharge),
        otherCharge: toDecimal(otherCharge),
        purchaseAmount: toDecimal(purchaseAmount),
        saleAmount: toDecimal(saleAmount),
        vendorName,
        purchaseDate,
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
    const stock = await prisma.inventoryStock.findUnique({
      where: { id },
      select: {
        id: true,
        stockCode: true,
        invoiceItems: {
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

    if (stock.invoiceItems.length > 0 || stock.karigarJobs.length > 0) {
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