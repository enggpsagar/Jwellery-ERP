// lib/actions/customer-actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { PartyGstType } from "@prisma/client"
import { partyGstTypeLabel } from "@/lib/gst"
import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"
import { getCurrentUser } from "@/lib/auth/auth"
import * as XLSX from "xlsx"
import {
  getCustomersCore,
  getCustomerByIdCore,
  createCustomerCore,
  updateCustomerCore,
  getCustomerWhere,
  getCustomerOrderBy,
  mapCustomer,
  CUSTOMER_LIST_INCLUDE,
  type CustomerRecord,
  type CustomerFormState as CoreCustomerFormState,
  type CustomerSortBy as CoreCustomerSortBy,
  type SortOrder as CoreSortOrder,
  type GetCustomersParams as CoreGetCustomersParams,
  type CustomersListResponse as CoreCustomersListResponse,
  type CustomerInput,
} from "@/lib/core/customer"

// Re-declared (not re-exported via `export type {...} from`, which Next's
// "use server" export transform can't handle) so every existing
// `import { type Customer } from "@/lib/actions/customer-actions"` across
// the app keeps working unchanged — the canonical definitions now live in
// lib/core/customer.ts.
export type Customer = CustomerRecord
export type CustomerFormState = CoreCustomerFormState
export type CustomerSortBy = CoreCustomerSortBy
export type SortOrder = CoreSortOrder
export type GetCustomersParams = CoreGetCustomersParams
export type CustomersListResponse = CoreCustomersListResponse

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

function toPartyGstType(value: FormDataEntryValue | null): PartyGstType {
  const parsed = String(value || "").trim()
  return Object.values(PartyGstType).includes(parsed as PartyGstType)
    ? (parsed as PartyGstType)
    : PartyGstType.UNREGISTERED
}

function formDataToCustomerInput(formData: FormData): CustomerInput {
  return {
    name: String(formData.get("name") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    altPhone: String(formData.get("altPhone") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    address: String(formData.get("address") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    state: String(formData.get("state") || "").trim(),
    pincode: String(formData.get("pincode") || "").trim(),
    gstNumber: String(formData.get("gstNumber") || "").trim(),
    gstType: toPartyGstType(formData.get("gstType")),
    panNumber: String(formData.get("panNumber") || "").trim(),
    registrationId: String(formData.get("registrationId") || "").trim(),
    notes: String(formData.get("notes") || "").trim(),
    openingBalance: toNumber(formData.get("openingBalance"), 0),
  }
}

export async function getCustomers(
  params: GetCustomersParams = {}
): Promise<CustomersListResponse> {
  const storeId = await requireStoreScope()
  return getCustomersCore(params, storeId)
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const storeId = await requireStoreScope()
  return getCustomerByIdCore(id, storeId)
}

async function getAllCustomersForExport(
  params: ExportCustomersParams = {}
): Promise<Customer[]> {
  const sortBy: CustomerSortBy = params.sortBy || "createdAt"
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
    : getCustomerWhere(storeId, params.search)

  const customers = await prisma.customer.findMany({
    where,
    orderBy: getCustomerOrderBy(sortBy, sortOrder),
    include: CUSTOMER_LIST_INCLUDE,
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
      "GST Type": partyGstTypeLabel(customer.gstType ?? "UNREGISTERED"),
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
  const storeId = await requireStoreScope()
  const actor = await getCurrentUser()

  const result = await createCustomerCore(formDataToCustomerInput(formData), {
    storeId,
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? actor?.email ?? null,
  })

  if (result.success) revalidatePath("/customers")
  return result
}

export async function updateCustomer(
  id: string,
  prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const storeId = await requireStoreScope()
  const result = await updateCustomerCore(id, formDataToCustomerInput(formData), storeId)

  if (result.success) {
    revalidatePath("/customers")
    revalidatePath(`/customers/${id}`)
  }
  return result
}

export async function archiveCustomer(id: string): Promise<CustomerFormState> {
  try {
    const storeId = await requireStoreScope()

    const { count } = await prisma.customer.updateMany({
      where: { id, storeId },
      data: {
        isArchived: true,
      },
    })

    if (count === 0) {
      return {
        success: false,
        message: "Customer not found",
      }
    }

    revalidatePath("/customers")
    revalidatePath("/customers/archived")
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

export async function unarchiveCustomer(id: string): Promise<CustomerFormState> {
  try {
    const storeId = await requireStoreScope()

    const { count } = await prisma.customer.updateMany({
      where: { id, storeId },
      data: {
        isArchived: false,
      },
    })

    if (count === 0) {
      return {
        success: false,
        message: "Customer not found",
      }
    }

    revalidatePath("/customers")
    revalidatePath("/customers/archived")
    revalidatePath(`/customers/${id}`)

    return {
      success: true,
      message: "Customer restored successfully",
    }
  } catch (error) {
    console.error("unarchiveCustomer error:", error)
    return {
      success: false,
      message: "Failed to restore customer",
    }
  }
}

export async function deleteCustomer(id: string): Promise<CustomerFormState> {
  try {
    const storeId = await requireStoreScope()

    const customer = await prisma.customer.findFirst({
      where: { id, storeId },
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

export type BulkDeleteResult = {
  deletedCount: number
  failures: { id: string; message: string }[]
}

/**
 * Deletes each selected customer through the exact same deleteCustomer()
 * call a single-row delete uses — never a bare deleteMany — so a bulk
 * selection can't bypass the invoice/ledger dependency guard just because
 * several rows were ticked at once. Partial success is expected and
 * reported per row, not treated as a whole-batch failure.
 */
export async function bulkDeleteCustomers(ids: string[]): Promise<BulkDeleteResult> {
  const failures: BulkDeleteResult["failures"] = []
  let deletedCount = 0

  for (const id of ids) {
    const result = await deleteCustomer(id)
    if (result.success) {
      deletedCount++
    } else {
      failures.push({ id, message: result.message })
    }
  }

  return { deletedCount, failures }
}