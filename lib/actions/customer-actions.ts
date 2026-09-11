// lib/actions/customer-actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { Prisma, PartyGstType } from "@prisma/client"
import { partyGstTypeLabel, PARTY_GST_TYPE_OPTIONS } from "@/lib/gst"
import { prisma } from "@/lib/prisma"
import { requireStoreScope, getStoreIdForRead } from "@/lib/store-context"
import { actionErrorMessage } from "@/lib/action-error";
import { getCurrentUser } from "@/lib/auth/auth"
import {
  buildExcelExport,
  buildCsvExportBase64,
  buildPdfExportBase64,
  buildMultiSheetExcelExport,
  parseExcelUpload,
} from "@/lib/excel-export"
import { normalizePanNumber } from "@/lib/pan"
import { normalizeAadhaarNumber } from "@/lib/aadhaar"
import {
  getCustomersCore,
  getCustomerByIdCore,
  createCustomerCore,
  updateCustomerCore,
  validateCustomerInput,
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
import { logger } from "@/lib/logger";

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
  format?: "csv" | "xlsx" | "pdf"
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
    aadhaarNumber: String(formData.get("aadhaarNumber") || "").trim(),
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
  const storeId = await getStoreIdForRead()
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
        message: "No parties found to export.",
      }
    }

    const rows = customers.map((customer, index) => ({
      "Sr. No.": index + 1,
      "Party Name": customer.name || "",
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

    const { fileName, fileBase64 } =
      params.format === "csv"
        ? buildCsvExportBase64(rows, "parties")
        : params.format === "pdf"
          ? buildPdfExportBase64(rows, "Parties", "parties")
          : buildExcelExport(rows, "Parties", "parties")

    return {
      success: true,
      message: "Parties exported successfully.",
      fileName,
      fileBase64,
    }
  } catch (error) {
    logger.error("exportCustomersToExcel error", error)
    return {
      success: false,
      message: actionErrorMessage(error, "Failed to export parties."),
    }
  }
}

export async function addCustomer(
  prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  try {
    const storeId = await requireStoreScope()
    const actor = await getCurrentUser()

    const result = await createCustomerCore(formDataToCustomerInput(formData), {
      storeId,
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? actor?.email ?? null,
    })

    if (result.success) revalidatePath("/customers")
    return result
  } catch (error) {
    logger.error("addCustomer error", error)
    return { success: false, message: actionErrorMessage(error, "Failed to create party") }
  }
}

export async function updateCustomer(
  id: string,
  prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  try {
    const storeId = await requireStoreScope()
    const result = await updateCustomerCore(id, formDataToCustomerInput(formData), storeId)

    if (result.success) {
      revalidatePath("/customers")
      revalidatePath(`/customers/${id}`)
    }
    return result
  } catch (error) {
    logger.error("updateCustomer error", error)
    return { success: false, message: actionErrorMessage(error, "Failed to update party") }
  }
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
        message: "Party not found",
      }
    }

    revalidatePath("/customers")
    revalidatePath("/customers/archived")
    revalidatePath(`/customers/${id}`)

    return {
      success: true,
      message: "Party archived successfully",
    }
  } catch (error) {
    logger.error("archiveCustomer error", error)
    return {
      success: false,
      message: actionErrorMessage(error, "Failed to archive party"),
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
        message: "Party not found",
      }
    }

    revalidatePath("/customers")
    revalidatePath("/customers/archived")
    revalidatePath(`/customers/${id}`)

    return {
      success: true,
      message: "Party restored successfully",
    }
  } catch (error) {
    logger.error("unarchiveCustomer error", error)
    return {
      success: false,
      message: actionErrorMessage(error, "Failed to restore party"),
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
        message: "Party not found",
      }
    }

    if (customer.invoices.length > 0 || customer.ledgerEntries.length > 0) {
      return {
        success: false,
        message:
          "Party cannot be deleted because invoice/ledger history exists. Please archive instead.",
      }
    }

    await prisma.customer.delete({
      where: { id },
    })

    revalidatePath("/customers")

    return {
      success: true,
      message: "Party deleted successfully",
    }
  } catch (error) {
    logger.error("deleteCustomer error", error)
    return {
      success: false,
      message: actionErrorMessage(error, "Failed to delete party"),
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

export type CustomerImportResult = {
  success: boolean
  message: string
  createdCount?: number
  /** Row-level problems. Populated only when nothing was created — nothing
   * is written until the whole file is clean. */
  errors?: string[]
}

/**
 * A downloadable .xlsx showing the expected columns and one filled-in
 * example row — column names mirror exportCustomersToExcel's own headers
 * ("Party Name", "Alternate Phone") so a party exported from here and
 * re-imported elsewhere lines up without renaming anything.
 */
export async function getCustomerImportTemplate(): Promise<{
  fileName: string
  fileBase64: string
}> {
  await requireStoreScope()

  const example = {
    "Party Name": "Walk-in Customer",
    Phone: "9876543210",
    "Alternate Phone": "",
    Email: "customer@example.com",
    Address: "123 MG Road",
    City: "Mumbai",
    State: "Maharashtra",
    Pincode: "400001",
    "GST Number": "",
    "GST Type": "Not GST Registered",
    "PAN Number": "",
    "Aadhaar Number": "",
    "Registration Id": "",
    Notes: "",
    "Opening Balance": 0,
  }

  return buildMultiSheetExcelExport(
    [{ name: "Parties Import", rows: [example], columns: Object.keys(example) }],
    "parties-import-template",
  )
}

function customerImportCell(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim()
}

function parsePartyGstTypeLabel(raw: string): PartyGstType {
  const match = PARTY_GST_TYPE_OPTIONS.find(
    (option) => option.label.toLowerCase() === raw.toLowerCase(),
  )
  return match?.value ?? PartyGstType.UNREGISTERED
}

/**
 * Bulk-adds parties from one spreadsheet — the multi-row-form alternative
 * for Customers, mirroring importInventoryStockFromExcel's own contract
 * exactly. Reuses validateCustomerInput (lib/core/customer.ts) so the
 * name/PAN/Aadhaar rules can never drift from the single "Add Party" form.
 * Row-level problems come back as a list and nothing is created until the
 * whole file is clean — a two-pass approach (validate everything first,
 * only then write) rather than createCustomerCore-per-row, since a partial
 * import would leave earlier rows committed if a later row failed.
 */
export async function importCustomersFromExcel(
  formData: FormData,
): Promise<CustomerImportResult> {
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

    const existingPhoneRows = await prisma.customer.findMany({
      where: { storeId, phone: { not: null } },
      select: { phone: true },
    })
    const existingPhones = new Set(
      existingPhoneRows.map((row) => (row.phone ?? "").trim()).filter(Boolean),
    )
    const seenPhonesInFile = new Set<string>()

    const errors: string[] = []
    const toCreate: Prisma.CustomerCreateManyInput[] = []

    for (const [index, row] of rows.entries()) {
      // +2 = one for the header row, one for 1-based spreadsheet numbering.
      const line = index + 2

      const input: CustomerInput = {
        name: customerImportCell(row, "Party Name"),
        phone: customerImportCell(row, "Phone"),
        altPhone: customerImportCell(row, "Alternate Phone"),
        email: customerImportCell(row, "Email"),
        address: customerImportCell(row, "Address"),
        city: customerImportCell(row, "City"),
        state: customerImportCell(row, "State"),
        pincode: customerImportCell(row, "Pincode"),
        gstNumber: customerImportCell(row, "GST Number"),
        gstType: parsePartyGstTypeLabel(customerImportCell(row, "GST Type")),
        panNumber: customerImportCell(row, "PAN Number"),
        aadhaarNumber: customerImportCell(row, "Aadhaar Number"),
        registrationId: customerImportCell(row, "Registration Id"),
        notes: customerImportCell(row, "Notes"),
      }

      const fieldErrors = validateCustomerInput(input)
      if (Object.keys(fieldErrors).length > 0) {
        for (const messages of Object.values(fieldErrors)) {
          for (const message of messages) errors.push(`Row ${line}: ${message}`)
        }
        continue
      }

      const phone = input.phone.trim()
      if (phone) {
        if (seenPhonesInFile.has(phone)) {
          errors.push(`Row ${line}: Phone number "${phone}" is duplicated in this file`)
          continue
        }
        if (existingPhones.has(phone)) {
          errors.push(`Row ${line}: A party with phone number "${phone}" already exists`)
          continue
        }
      }

      const rawOpeningBalance = customerImportCell(row, "Opening Balance")
      const openingBalance = rawOpeningBalance === "" ? 0 : Number(rawOpeningBalance)
      if (!Number.isFinite(openingBalance)) {
        errors.push(`Row ${line}: Opening Balance must be a number`)
        continue
      }

      if (phone) seenPhonesInFile.add(phone)

      toCreate.push({
        storeId,
        name: input.name.trim(),
        phone: phone || null,
        alternatePhone: input.altPhone?.trim() || null,
        email: input.email?.trim() || null,
        addressLine1: input.address?.trim() || null,
        city: input.city?.trim() || null,
        state: input.state?.trim() || null,
        pincode: input.pincode?.trim() || null,
        gstin: input.gstNumber?.trim() || null,
        gstType: input.gstType ?? PartyGstType.UNREGISTERED,
        panNumber: input.panNumber?.trim() ? normalizePanNumber(input.panNumber) : null,
        aadhaarNumber: input.aadhaarNumber?.trim()
          ? normalizeAadhaarNumber(input.aadhaarNumber)
          : null,
        registrationId: input.registrationId?.trim() || null,
        notes: input.notes?.trim() || null,
        openingBalance,
        createdById: currentUser?.id ?? undefined,
        createdByName: currentUser?.name ?? undefined,
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

    await prisma.customer.createMany({ data: toCreate })

    revalidatePath("/customers")

    return {
      success: true,
      message: `Added ${toCreate.length} ${toCreate.length === 1 ? "party" : "parties"}.`,
      createdCount: toCreate.length,
    }
  } catch (error) {
    logger.error("importCustomersFromExcel error", error)
    return { success: false, message: "Failed to import parties." }
  }
}