// lib/actions/vendor-actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"
import { formatLedgerSource } from "@/lib/ledger-format"
import * as XLSX from "xlsx"

export type Vendor = {
  id: string
  name: string
  phone?: string
  altPhone?: string
  email?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  vendorType?: string
  openingBalance: number
  currentBalance?: number
  balanceType?: string
  goldBalance?: number
  silverBalance?: number
  creditLimit?: string
  paymentTerms?: string
  gstNumber?: string
  totalOrders?: number
  totalPurchaseValue?: string
  pendingAmount?: string
  lastPurchaseDate?: string
  lastPaymentDate?: string
  notes?: string
  createdAt?: string
}

export type VendorFormState = {
  success: boolean
  message: string
  errors?: Record<string, string[]>
  /** Set on a successful addVendor — lets a caller that navigated here to
   * create a vendor mid-flow (e.g. the purchase form) come back and select
   * the new row. Mirrors CustomerFormState.customer. */
  vendor?: {
    id: string
    name: string
    phone: string | null
    vendorCode: string | null
  }
}

export type VendorSortBy = "name" | "createdAt" | "openingBalance"
export type SortOrder = "asc" | "desc"

export type GetVendorsParams = {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: VendorSortBy
  sortOrder?: SortOrder
  /** Defaults to the active list — set true to list archived vendors instead. */
  archived?: boolean
}

export type VendorsListResponse = {
  vendors: Vendor[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

type ExportVendorsParams = {
  selectedIds?: string[]
  search?: string
  sortBy?: VendorSortBy
  sortOrder?: SortOrder
}

export type VendorLedgerEntryItem = {
  id: string
  type: "DEBIT" | "CREDIT"
  sourceType: string
  description: string
  amount: number
  entryDate: string
}

function toNumber(value: FormDataEntryValue | null, fallback = 0) {
  if (value === null || value === "") return fallback
  const num = Number(value)
  return Number.isNaN(num) ? fallback : num
}

function formatCurrency(value: number) {
  return `₹ ${value.toLocaleString("en-IN")}`
}

function formatDate(date?: Date | null) {
  if (!date) return "-"
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
}

function getVendorWhere(storeId: string, search?: string, archived = false) {
  const query = String(search || "").trim()

  return {
    storeId,
    isArchived: archived,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { phone: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
            { city: { contains: query, mode: "insensitive" as const } },
            { state: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }
}

function getVendorOrderBy(
  sortBy: VendorSortBy = "createdAt",
  sortOrder: SortOrder = "desc"
) {
  if (sortBy === "name") return { name: sortOrder }
  if (sortBy === "openingBalance") return { openingBalance: sortOrder }
  return { createdAt: sortOrder }
}

function mapVendor(vendor: any): Vendor {
  const totalOrders = vendor.purchases.length

  const totalPurchaseValueNumber = vendor.purchases.reduce(
    (sum: number, purchase: any) => sum + Number(purchase.totalAmount || 0),
    0
  )

  const pendingAmountNumber = vendor.purchases.reduce(
    (sum: number, purchase: any) => sum + Number(purchase.balanceAmount || 0),
    0
  )

  const lastPurchaseDate =
    vendor.purchases.length > 0
      ? formatDate(vendor.purchases[0].purchaseDate)
      : "-"

  const lastPaymentDate =
    vendor.ledgerEntries.length > 0
      ? formatDate(vendor.ledgerEntries[0].entryDate)
      : "-"

  return {
    id: vendor.id,
    name: vendor.name,
    phone: vendor.phone ?? "",
    altPhone: vendor.alternatePhone ?? "",
    email: vendor.email ?? "",
    address: vendor.addressLine1 ?? "",
    city: vendor.city ?? "",
    state: vendor.state ?? "",
    pincode: vendor.pincode ?? "",
    vendorType: "",
    openingBalance: Number(vendor.openingBalance ?? 0),
    currentBalance: Number(vendor.openingBalance ?? 0),
    balanceType: "Payable",
    goldBalance: 0,
    silverBalance: 0,
    creditLimit: "",
    paymentTerms: "",
    gstNumber: vendor.gstin ?? "",
    totalOrders,
    totalPurchaseValue: formatCurrency(totalPurchaseValueNumber),
    pendingAmount: formatCurrency(pendingAmountNumber),
    lastPurchaseDate,
    lastPaymentDate,
    notes: vendor.notes ?? "",
    createdAt: vendor.createdAt.toISOString(),
  }
}

export async function getVendors(
  params: GetVendorsParams = {}
): Promise<VendorsListResponse> {
  const page = Math.max(1, Number(params.page || 1))
  const pageSize = Math.max(1, Number(params.pageSize || 10))
  const search = String(params.search || "").trim()
  const sortBy: VendorSortBy = params.sortBy || "createdAt"
  const sortOrder: SortOrder = params.sortOrder || "desc"

  const storeId = await requireStoreScope()
  const where = getVendorWhere(storeId, search, params.archived)
  const orderBy = getVendorOrderBy(sortBy, sortOrder)

  const [totalCount, vendors] = await Promise.all([
    prisma.vendor.count({ where }),
    prisma.vendor.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        purchases: {
          select: {
            id: true,
            totalAmount: true,
            balanceAmount: true,
            purchaseDate: true,
          },
          orderBy: {
            purchaseDate: "desc",
          },
        },
        ledgerEntries: {
          select: {
            id: true,
            amount: true,
            entryDate: true,
          },
          orderBy: {
            entryDate: "desc",
          },
        },
      },
    }),
  ])

  const mappedVendors: Vendor[] = vendors.map(mapVendor)
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return {
    vendors: mappedVendors,
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

export async function getVendorById(id: string): Promise<Vendor | null> {
  const storeId = await requireStoreScope()

  const vendor = await prisma.vendor.findFirst({
    where: { id, storeId },
    include: {
      purchases: {
        select: {
          id: true,
          totalAmount: true,
          balanceAmount: true,
          purchaseDate: true,
        },
        orderBy: {
          purchaseDate: "desc",
        },
      },
      ledgerEntries: {
        select: {
          id: true,
          amount: true,
          entryDate: true,
        },
        orderBy: {
          entryDate: "desc",
        },
      },
    },
  })

  if (!vendor) return null
  return mapVendor(vendor)
}

export async function getVendorLedger(
  vendorId: string
): Promise<VendorLedgerEntryItem[]> {
  const storeId = await requireStoreScope()

  const entries = await prisma.ledgerEntry.findMany({
    where: { vendorId, storeId },
    orderBy: { entryDate: "desc" },
  })

  return entries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    sourceType: formatLedgerSource(entry.sourceType),
    description: entry.description ?? "",
    amount: Number(entry.amount ?? 0),
    entryDate: formatDate(entry.entryDate),
  }))
}

async function getAllVendorsForExport(
  params: ExportVendorsParams = {}
): Promise<Vendor[]> {
  const sortBy: VendorSortBy = params.sortBy || "createdAt"
  const sortOrder: SortOrder = params.sortOrder || "desc"

  const storeId = await requireStoreScope()
  const where = params.selectedIds?.length
    ? {
        id: {
          in: params.selectedIds,
        },
        storeId,
        isArchived: false,
      }
    : getVendorWhere(storeId, params.search)

  const vendors = await prisma.vendor.findMany({
    where,
    orderBy: getVendorOrderBy(sortBy, sortOrder),
    include: {
      purchases: {
        select: {
          id: true,
          totalAmount: true,
          balanceAmount: true,
          purchaseDate: true,
        },
        orderBy: {
          purchaseDate: "desc",
        },
      },
      ledgerEntries: {
        select: {
          id: true,
          amount: true,
          entryDate: true,
        },
        orderBy: {
          entryDate: "desc",
        },
      },
    },
  })

  return vendors.map(mapVendor)
}

export async function exportVendorsToExcel(
  params: ExportVendorsParams = {}
): Promise<{
  success: boolean
  message: string
  fileName?: string
  fileBase64?: string
}> {
  try {
    const vendors = await getAllVendorsForExport(params)

    if (!vendors.length) {
      return {
        success: false,
        message: "No vendors found to export.",
      }
    }

    const rows = vendors.map((vendor, index) => ({
      "Sr. No.": index + 1,
      "Vendor Name": vendor.name || "",
      Phone: vendor.phone || "",
      "Alternate Phone": vendor.altPhone || "",
      Email: vendor.email || "",
      Address: vendor.address || "",
      City: vendor.city || "",
      State: vendor.state || "",
      Pincode: vendor.pincode || "",
      "GST Number": vendor.gstNumber || "",
      "Opening Balance": vendor.openingBalance ?? 0,
      "Current Balance": vendor.currentBalance ?? 0,
      "Balance Type": vendor.balanceType || "",
      "Total Orders": vendor.totalOrders ?? 0,
      "Total Purchase Value": vendor.totalPurchaseValue || "",
      "Pending Amount": vendor.pendingAmount || "",
      "Last Purchase Date": vendor.lastPurchaseDate || "",
      "Last Payment Date": vendor.lastPaymentDate || "",
      Notes: vendor.notes || "",
      "Created At": vendor.createdAt
        ? new Date(vendor.createdAt).toLocaleString("en-IN")
        : "",
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Vendors")

    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, "0")

    const fileName = `vendors-${now.getFullYear()}-${pad(
      now.getMonth() + 1
    )}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(
      now.getMinutes()
    )}-${pad(now.getSeconds())}.xlsx`

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    })

    return {
      success: true,
      message: "Vendors exported successfully.",
      fileName,
      fileBase64: Buffer.from(buffer).toString("base64"),
    }
  } catch (error) {
    console.error("exportVendorsToExcel error:", error)
    return {
      success: false,
      message: "Failed to export vendors.",
    }
  }
}

export async function addVendor(
  prevState: VendorFormState,
  formData: FormData
): Promise<VendorFormState> {
  try {
    const name = String(formData.get("name") || "").trim()
    const phone = String(formData.get("phone") || "").trim()
    const altPhone = String(formData.get("altPhone") || "").trim()
    const email = String(formData.get("email") || "").trim()
    const address = String(formData.get("address") || "").trim()
    const city = String(formData.get("city") || "").trim()
    const state = String(formData.get("state") || "").trim()
    const pincode = String(formData.get("pincode") || "").trim()
    const gstNumber = String(formData.get("gstNumber") || "").trim()
    const notes = String(formData.get("notes") || "").trim()
    const openingBalance = toNumber(formData.get("openingBalance"), 0)

    const errors: Record<string, string[]> = {}

    if (!name) errors.name = ["Vendor name is required"]
    if (!phone) errors.phone = ["Phone number is required"]

    if (Object.keys(errors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors,
      }
    }

    const storeId = await requireStoreScope()

    const created = await prisma.vendor.create({
      select: { id: true, name: true, phone: true, vendorCode: true },
      data: {
        storeId,
        name,
        phone: phone || null,
        alternatePhone: altPhone || null,
        email: email || null,
        addressLine1: address || null,
        city: city || null,
        state: state || null,
        pincode: pincode || null,
        gstin: gstNumber || null,
        notes: notes || null,
        openingBalance,
      },
    })

    revalidatePath("/vendors")

    return {
      success: true,
      message: "Vendor added successfully",
      vendor: created,
    }
  } catch (error) {
    console.error("addVendor error:", error)
    return {
      success: false,
      message: "Failed to add vendor",
    }
  }
}

export async function updateVendor(
  id: string,
  prevState: VendorFormState,
  formData: FormData
): Promise<VendorFormState> {
  try {
    const name = String(formData.get("name") || "").trim()
    const phone = String(formData.get("phone") || "").trim()
    const altPhone = String(formData.get("altPhone") || "").trim()
    const email = String(formData.get("email") || "").trim()
    const address = String(formData.get("address") || "").trim()
    const city = String(formData.get("city") || "").trim()
    const state = String(formData.get("state") || "").trim()
    const pincode = String(formData.get("pincode") || "").trim()
    const gstNumber = String(formData.get("gstNumber") || "").trim()
    const notes = String(formData.get("notes") || "").trim()
    const openingBalance = toNumber(formData.get("openingBalance"), 0)

    const errors: Record<string, string[]> = {}

    if (!name) errors.name = ["Vendor name is required"]
    if (!phone) errors.phone = ["Phone number is required"]

    if (Object.keys(errors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors,
      }
    }

    const storeId = await requireStoreScope()

    const { count } = await prisma.vendor.updateMany({
      where: { id, storeId },
      data: {
        name,
        phone: phone || null,
        alternatePhone: altPhone || null,
        email: email || null,
        addressLine1: address || null,
        city: city || null,
        state: state || null,
        pincode: pincode || null,
        gstin: gstNumber || null,
        notes: notes || null,
        openingBalance,
      },
    })

    if (count === 0) {
      return {
        success: false,
        message: "Vendor not found",
      }
    }

    revalidatePath("/vendors")
    revalidatePath(`/vendors/${id}`)

    return {
      success: true,
      message: "Vendor updated successfully",
    }
  } catch (error) {
    console.error("updateVendor error:", error)
    return {
      success: false,
      message: "Failed to update vendor",
    }
  }
}

export async function archiveVendor(id: string): Promise<VendorFormState> {
  try {
    const storeId = await requireStoreScope()

    const { count } = await prisma.vendor.updateMany({
      where: { id, storeId },
      data: {
        isArchived: true,
      },
    })

    if (count === 0) {
      return {
        success: false,
        message: "Vendor not found",
      }
    }

    revalidatePath("/vendors")
    revalidatePath("/vendors/archived")
    revalidatePath(`/vendors/${id}`)

    return {
      success: true,
      message: "Vendor archived successfully",
    }
  } catch (error) {
    console.error("archiveVendor error:", error)
    return {
      success: false,
      message: "Failed to archive vendor",
    }
  }
}

export async function unarchiveVendor(id: string): Promise<VendorFormState> {
  try {
    const storeId = await requireStoreScope()

    const { count } = await prisma.vendor.updateMany({
      where: { id, storeId },
      data: {
        isArchived: false,
      },
    })

    if (count === 0) {
      return {
        success: false,
        message: "Vendor not found",
      }
    }

    revalidatePath("/vendors")
    revalidatePath("/vendors/archived")
    revalidatePath(`/vendors/${id}`)

    return {
      success: true,
      message: "Vendor restored successfully",
    }
  } catch (error) {
    console.error("unarchiveVendor error:", error)
    return {
      success: false,
      message: "Failed to restore vendor",
    }
  }
}

export async function deleteVendor(id: string): Promise<VendorFormState> {
  try {
    const storeId = await requireStoreScope()

    const vendor = await prisma.vendor.findFirst({
      where: { id, storeId },
      include: {
        purchases: {
          select: { id: true },
          take: 1,
        },
        ledgerEntries: {
          select: { id: true },
          take: 1,
        },
      },
    })

    if (!vendor) {
      return {
        success: false,
        message: "Vendor not found",
      }
    }

    if (vendor.purchases.length > 0 || vendor.ledgerEntries.length > 0) {
      return {
        success: false,
        message:
          "Vendor cannot be deleted because purchase/ledger history exists. Please archive instead.",
      }
    }

    await prisma.vendor.delete({
      where: { id },
    })

    revalidatePath("/vendors")

    return {
      success: true,
      message: "Vendor deleted successfully",
    }
  } catch (error) {
    console.error("deleteVendor error:", error)
    return {
      success: false,
      message: "Failed to delete vendor",
    }
  }
}
