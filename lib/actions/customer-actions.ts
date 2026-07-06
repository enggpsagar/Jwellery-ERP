// lib/actions/customer-actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"

export type Customer = {
  id: string
  name: string
  phone?: string
  altPhone?: string
  email?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  customerType?: string
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

export type CustomerFormState = {
  success: boolean
  message: string
  errors?: Record<string, string[]>
}

export type CustomerSortBy = "name" | "createdAt" | "openingBalance"
export type SortOrder = "asc" | "desc"

export type GetCustomersParams = {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: CustomerSortBy
  sortOrder?: SortOrder
}

export type CustomersListResponse = {
  customers: Customer[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

type ExportCustomersParams = {
  selectedIds?: string[]
  search?: string
  sortBy?: CustomerSortBy
  sortOrder?: SortOrder
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

function getCustomerWhere(search?: string) {
  const query = String(search || "").trim()

  return {
    isArchived: false,
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

function getCustomerOrderBy(
  sortBy: CustomerSortBy = "createdAt",
  sortOrder: SortOrder = "desc"
) {
  if (sortBy === "name") return { name: sortOrder }
  if (sortBy === "openingBalance") return { openingBalance: sortOrder }
  return { createdAt: sortOrder }
}

function mapCustomer(customer: any): Customer {
  const totalOrders = customer.invoices.length

  const totalPurchaseValueNumber = customer.invoices.reduce(
    (sum: number, invoice: any) => sum + Number(invoice.totalAmount || 0),
    0
  )

  const pendingAmountNumber = customer.invoices.reduce(
    (sum: number, invoice: any) => sum + Number(invoice.balanceAmount || 0),
    0
  )

  const lastPurchaseDate =
    customer.invoices.length > 0
      ? formatDate(customer.invoices[0].invoiceDate)
      : "-"

  const lastPaymentDate =
    customer.ledgerEntries.length > 0
      ? formatDate(customer.ledgerEntries[0].entryDate)
      : "-"

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone ?? "",
    altPhone: customer.alternatePhone ?? "",
    email: customer.email ?? "",
    address: customer.addressLine1 ?? "",
    city: customer.city ?? "",
    state: customer.state ?? "",
    pincode: customer.pincode ?? "",
    customerType: "",
    openingBalance: Number(customer.openingBalance ?? 0),
    currentBalance: Number(customer.openingBalance ?? 0),
    balanceType: "Receivable",
    goldBalance: 0,
    silverBalance: 0,
    creditLimit: "",
    paymentTerms: "",
    gstNumber: customer.gstin ?? "",
    totalOrders,
    totalPurchaseValue: formatCurrency(totalPurchaseValueNumber),
    pendingAmount: formatCurrency(pendingAmountNumber),
    lastPurchaseDate,
    lastPaymentDate,
    notes: customer.notes ?? "",
    createdAt: customer.createdAt.toISOString(),
  }
}

export async function getCustomers(
  params: GetCustomersParams = {}
): Promise<CustomersListResponse> {
  const page = Math.max(1, Number(params.page || 1))
  const pageSize = Math.max(1, Number(params.pageSize || 10))
  const search = String(params.search || "").trim()
  const sortBy: CustomerSortBy = params.sortBy || "createdAt"
  const sortOrder: SortOrder = params.sortOrder || "desc"

  const where = getCustomerWhere(search)
  const orderBy = getCustomerOrderBy(sortBy, sortOrder)

  const [totalCount, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        invoices: {
          select: {
            id: true,
            totalAmount: true,
            balanceAmount: true,
            invoiceDate: true,
          },
          orderBy: {
            invoiceDate: "desc",
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

  const mappedCustomers: Customer[] = customers.map(mapCustomer)
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return {
    customers: mappedCustomers,
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

export async function getCustomerById(id: string): Promise<Customer | null> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      invoices: {
        select: {
          id: true,
          totalAmount: true,
          balanceAmount: true,
          invoiceDate: true,
        },
        orderBy: {
          invoiceDate: "desc",
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

  if (!customer) return null
  return mapCustomer(customer)
}

async function getAllCustomersForExport(
  params: ExportCustomersParams = {}
): Promise<Customer[]> {
  const sortBy: CustomerSortBy = params.sortBy || "createdAt"
  const sortOrder: SortOrder = params.sortOrder || "desc"

  const where = params.selectedIds?.length
    ? {
        id: {
          in: params.selectedIds,
        },
        isArchived: false,
      }
    : getCustomerWhere(params.search)

  const customers = await prisma.customer.findMany({
    where,
    orderBy: getCustomerOrderBy(sortBy, sortOrder),
    include: {
      invoices: {
        select: {
          id: true,
          totalAmount: true,
          balanceAmount: true,
          invoiceDate: true,
        },
        orderBy: {
          invoiceDate: "desc",
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

  return customers.map(mapCustomer)
}

export async function exportCustomersToExcel(
  params: ExportCustomersParams = {}
): Promise<{
  success: boolean
  message: string
  fileName?: string
  fileBase64?: string
}> {
  try {
    const customers = await getAllCustomersForExport(params)

    if (!customers.length) {
      return {
        success: false,
        message: "No customers found to export.",
      }
    }

    const rows = customers.map((customer, index) => ({
      "Sr. No.": index + 1,
      "Customer Name": customer.name || "",
      Phone: customer.phone || "",
      "Alternate Phone": customer.altPhone || "",
      Email: customer.email || "",
      Address: customer.address || "",
      City: customer.city || "",
      State: customer.state || "",
      Pincode: customer.pincode || "",
      "GST Number": customer.gstNumber || "",
      "Opening Balance": customer.openingBalance ?? 0,
      "Current Balance": customer.currentBalance ?? 0,
      "Balance Type": customer.balanceType || "",
      "Total Orders": customer.totalOrders ?? 0,
      "Total Purchase Value": customer.totalPurchaseValue || "",
      "Pending Amount": customer.pendingAmount || "",
      "Last Purchase Date": customer.lastPurchaseDate || "",
      "Last Payment Date": customer.lastPaymentDate || "",
      Notes: customer.notes || "",
      "Created At": customer.createdAt
        ? new Date(customer.createdAt).toLocaleString("en-IN")
        : "",
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers")

    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, "0")

    const fileName = `customers-${now.getFullYear()}-${pad(
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
      message: "Customers exported successfully.",
      fileName,
      fileBase64: Buffer.from(buffer).toString("base64"),
    }
  } catch (error) {
    console.error("exportCustomersToExcel error:", error)
    return {
      success: false,
      message: "Failed to export customers.",
    }
  }
}

export async function addCustomer(
  prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
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

    if (!name) errors.name = ["Customer name is required"]
    if (!phone) errors.phone = ["Phone number is required"]

    if (Object.keys(errors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors,
      }
    }

    await prisma.customer.create({
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

    revalidatePath("/customers")

    return {
      success: true,
      message: "Customer added successfully",
    }
  } catch (error) {
    console.error("addCustomer error:", error)
    return {
      success: false,
      message: "Failed to add customer",
    }
  }
}

export async function updateCustomer(
  id: string,
  prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
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

    if (!name) errors.name = ["Customer name is required"]
    if (!phone) errors.phone = ["Phone number is required"]

    if (Object.keys(errors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors,
      }
    }

    await prisma.customer.update({
      where: { id },
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

    revalidatePath("/customers")
    revalidatePath(`/customers/${id}`)

    return {
      success: true,
      message: "Customer updated successfully",
    }
  } catch (error) {
    console.error("updateCustomer error:", error)
    return {
      success: false,
      message: "Failed to update customer",
    }
  }
}

export async function archiveCustomer(id: string): Promise<CustomerFormState> {
  try {
    await prisma.customer.update({
      where: { id },
      data: {
        isArchived: true,
      },
    })

    revalidatePath("/customers")
    revalidatePath(`/customers/${id}`)

    return {
      success: true,
      message: "Customer archived successfully",
    }
  } catch (error) {
    console.error("archiveCustomer error:", error)
    return {
      success: false,
      message: "Failed to archive customer",
    }
  }
}

export async function deleteCustomer(id: string): Promise<CustomerFormState> {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: {
          select: { id: true },
          take: 1,
        },
        ledgerEntries: {
          select: { id: true },
          take: 1,
        },
      },
    })

    if (!customer) {
      return {
        success: false,
        message: "Customer not found",
      }
    }

    if (customer.invoices.length > 0 || customer.ledgerEntries.length > 0) {
      return {
        success: false,
        message:
          "Customer cannot be deleted because invoice/ledger history exists. Please archive instead.",
      }
    }

    await prisma.customer.delete({
      where: { id },
    })

    revalidatePath("/customers")

    return {
      success: true,
      message: "Customer deleted successfully",
    }
  } catch (error) {
    console.error("deleteCustomer error:", error)
    return {
      success: false,
      message: "Failed to delete customer",
    }
  }
}