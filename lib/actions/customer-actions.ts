// lib/actions/customer-actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { Prisma, PartyGstType } from "@prisma/client"
import {
  partyGstTypeLabel,
  parsePartyGstType,
  defaultPartyGstType,
  normalizeGstin,
  PARTY_GST_TYPE_OPTIONS,
} from "@/lib/gst"
import { prisma } from "@/lib/prisma"
import {
  requireStoreScope,
  getStoreIdForRead,
  assertPlanActiveForExport,
} from "@/lib/store-context"
import { formatShortDateTime } from "@/lib/utils"
import {
  PARTY_SHEET_COLUMNS,
  PARTY_SHEET_HEADERS,
  PARTY_SHEET_EXPORT_ONLY_HEADERS,
  PARTY_SHEET_NOTES,
  partySheetInstructions,
} from "@/lib/customers/customer-sheet"
import { actionErrorMessage } from "@/lib/action-error";
import { getCurrentUser } from "@/lib/auth/auth"
import {
  buildCsvExportBase64,
  buildPdfExportBase64,
  buildImportTemplateWithDropdowns,
  parseExcelUpload,
} from "@/lib/excel-export"
import { normalizePanNumber } from "@/lib/pan"
import { normalizeAadhaarNumber } from "@/lib/aadhaar"
import {
  getCustomersCore,
  getCustomerByIdCore,
  createCustomerCore,
  updateCustomerCore,
  setCustomerSupplierStatusCore,
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
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { logger } from "@/lib/logger";
import { earlierRowHint, existingRecordHint, namesAsCandidates, suggestFrom } from "@/lib/import-suggest"

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
  dateFrom?: string
  dateTo?: string
  format?: "csv" | "xlsx" | "pdf"
  /** The Suppliers page's export — only parties tagged isSupplier. */
  supplierOnly?: boolean
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

/**
 * Lightweight, unpaginated Supplier picker for a plain dropdown (Stock's
 * own Vendor Name field) — same isSupplier scoping as the /suppliers list
 * (getCustomers({ supplierOnly: true })), but that one is paginated for a
 * table and this needs every active supplier at once, same shape as
 * getPurchaseFormParties() in purchase-actions.ts.
 *
 * With the Supplier module off, isSupplier can never actually be set on any
 * party — toggleCustomerSupplierStatus above refuses while it's off, same
 * as the module's own UI being hidden then — so filtering on it here would
 * silently return nothing for a store in that mode. Falls back to every
 * active party in that case, same "no distinction, any party can be a
 * vendor" shape getPurchaseFormParties() already always uses.
 */
export async function getSupplierOptions(): Promise<
  { id: string; name: string; phone: string | null }[]
> {
  const storeId = await requireStoreScope()
  const settings = await getBusinessSettings()

  return prisma.customer.findMany({
    where: {
      storeId,
      isActive: true,
      isArchived: false,
      ...(settings.supplierModuleEnabled ? { isSupplier: true } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true },
  })
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
        ...(params.supplierOnly ? { isSupplier: true } : {}),
      }
    : getCustomerWhere(
        storeId,
        params.search,
        false,
        params.dateFrom,
        params.dateTo,
        params.supplierOnly,
      )

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
    const storeId = await requireStoreScope()
    await assertPlanActiveForExport(storeId)

    const customers = await getAllCustomersForExport(params)

    if (!customers.length) {
      return {
        success: false,
        message: params.supplierOnly ? "No suppliers found to export." : "No parties found to export.",
      }
    }

    // The import template's columns, in its order, with values the import
    // reads back (labels, plain numbers) — then read-only computed columns
    // the import ignores. See lib/customers/customer-sheet.ts.
    const columns = [...PARTY_SHEET_HEADERS, ...PARTY_SHEET_EXPORT_ONLY_HEADERS]
    const dash = (value?: string) => (value && value !== "-" ? value : "")
    const rows = customers.map((customer) => {
      const values: Record<string, unknown> = {
        "Party Name": customer.name || "",
        "GST Type": partyGstTypeLabel(customer.gstType ?? "UNREGISTERED"),
        "GST Number": customer.gstNumber || "",
        Phone: customer.phone || "",
        "Alternate Phone": customer.altPhone || "",
        Email: customer.email || "",
        Address: customer.address || "",
        Notes: customer.notes || "",
        State: customer.state || "",
        City: customer.city || "",
        Pincode: customer.pincode || "",
        "PAN Number": customer.panNumber || "",
        "Aadhaar Number": customer.aadhaarNumber || "",
        "Registration Id": customer.registrationId || "",
        "Opening Balance": customer.openingBalance ?? 0,
        "Current Balance": customer.currentBalance ?? 0,
        "Balance Type": customer.balanceType || "",
        "Total Orders": customer.totalOrders ?? 0,
        "Total Purchase Value": customer.totalPurchaseValueAmount ?? 0,
        "Pending Amount": customer.pendingAmountValue ?? 0,
        "Last Purchase Date": dash(customer.lastPurchaseDate),
        "Last Payment Date": dash(customer.lastPaymentDate),
        "Created At": customer.createdAt ? formatShortDateTime(customer.createdAt) : "",
      }
      return Object.fromEntries(columns.map((header) => [header, values[header] ?? ""]))
    })

    const filePrefix = params.supplierOnly ? "suppliers" : "parties"
    const { fileName, fileBase64 } =
      params.format === "csv"
        ? buildCsvExportBase64(rows, filePrefix)
        : params.format === "pdf"
          ? buildPdfExportBase64(rows, params.supplierOnly ? "Suppliers" : "Parties", filePrefix)
          : buildImportTemplateWithDropdowns({
              sheetName: params.supplierOnly ? "Suppliers" : "Parties",
              rows,
              columns,
              dropdowns: await loadPartySheetDropdowns(),
              instructions: { notes: PARTY_SHEET_NOTES, rows: partySheetInstructions() },
              filePrefix,
            })

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
    const { gstScheme } = await getBusinessSettings()

    const result = await createCustomerCore(formDataToCustomerInput(formData), {
      storeId,
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? actor?.email ?? null,
      gstScheme,
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
    const { gstScheme } = await getBusinessSettings()
    const result = await updateCustomerCore(
      id,
      formDataToCustomerInput(formData),
      storeId,
      gstScheme,
    )

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

/**
 * The "Also Supplier" action on a Party's detail page — see
 * setCustomerSupplierStatusCore's own doc comment. Refuses outright while
 * the Supplier module is off, same as that action's own UI being hidden
 * then — a direct call here (bypassing the UI) shouldn't work either.
 */
export async function toggleCustomerSupplierStatus(
  id: string,
  isSupplier: boolean,
): Promise<CustomerFormState> {
  try {
    const storeId = await requireStoreScope()

    const settings = await getBusinessSettings()
    if (!settings.supplierModuleEnabled) {
      return { success: false, message: "The Supplier module is turned off in Settings" }
    }

    const result = await setCustomerSupplierStatusCore(id, storeId, isSupplier)

    if (result.success) {
      revalidatePath("/customers")
      revalidatePath("/suppliers")
      revalidatePath(`/customers/${id}`)
    }

    return result
  } catch (error) {
    logger.error("toggleCustomerSupplierStatus error", error)
    return {
      success: false,
      message: actionErrorMessage(error, "Failed to update supplier status"),
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

/** The Party sheet's dropdowns: GST Type labels and the State list (the
 *  same list the Add Party form offers). Cities are too many for a dropdown;
 *  the import checks them against the State. */
async function loadPartySheetDropdowns(): Promise<Record<string, string[]>> {
  const states = await prisma.state.findMany({ orderBy: { name: "asc" }, select: { name: true } })
  return {
    "GST Type": PARTY_GST_TYPE_OPTIONS.map((option) => option.label),
    State: states.map((state) => state.name),
  }
}

/**
 * The Party import template: the same columns as the Party export (see
 * lib/customers/customer-sheet.ts), one example row, an Instructions sheet
 * and dropdowns for GST Type and State.
 */
export async function getCustomerImportTemplate(): Promise<{
  fileName: string
  fileBase64: string
}> {
  await requireStoreScope()

  const example = Object.fromEntries(
    PARTY_SHEET_COLUMNS.map((column) => [column.header, column.example]),
  )

  return buildImportTemplateWithDropdowns({
    sheetName: "Parties Import",
    rows: [example],
    columns: PARTY_SHEET_HEADERS,
    dropdowns: await loadPartySheetDropdowns(),
    instructions: { notes: PARTY_SHEET_NOTES, rows: partySheetInstructions() },
    filePrefix: "parties-import-template",
  })
}

function customerImportCell(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim()
}

/**
 * Bulk-adds parties from one spreadsheet. Applies the Add Party form's
 * rules (validateCustomerInput — name, GSTIN format and "required for a
 * registered party", PAN, Aadhaar, email, pincode), plus what the form's
 * pickers enforce: GST Type must be one of the three (blank = the store's
 * default, like the form), State must be in the State list and City one of
 * that State's cities. Row-level problems come back as a list and nothing is
 * created until the whole file is clean (one createMany).
 */
export async function importCustomersFromExcel(
  formData: FormData,
): Promise<CustomerImportResult> {
  try {
    const storeId = await requireStoreScope()
    const currentUser = await getCurrentUser()
    const { gstScheme } = await getBusinessSettings()
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
      select: { phone: true, name: true, customerCode: true, vendorCode: true },
    })
    const partyByPhone = new Map(
      existingPhoneRows
        .filter((row) => (row.phone ?? "").trim())
        .map((row) => [(row.phone ?? "").trim(), row]),
    )
    const firstLineByPhone = new Map<string, number>()

    // States by lower-cased name; cities only for the states the file uses.
    const states = await prisma.state.findMany({ select: { id: true, name: true } })
    const stateByName = new Map(states.map((state) => [state.name.toLowerCase(), state]))
    const usedStateIds = [
      ...new Set(
        rows
          .map((row) => stateByName.get(customerImportCell(row, "State").toLowerCase())?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ]
    const cities = usedStateIds.length
      ? await prisma.city.findMany({
          where: { stateId: { in: usedStateIds } },
          select: { name: true, stateId: true },
        })
      : []
    const cityByStateAndName = new Map(
      cities.map((city) => [`${city.stateId}:${city.name.toLowerCase()}`, city.name]),
    )

    const errors: string[] = []
    const toCreate: Prisma.CustomerCreateManyInput[] = []

    for (const [index, row] of rows.entries()) {
      // +2 = one for the header row, one for 1-based spreadsheet numbering.
      const line = index + 2
      const rowErrors: string[] = []

      // Blank = the store's default for a new party, as the Add Party form
      // pre-selects; anything that isn't one of the three is an error rather
      // than a silent "Not GST Registered".
      const rawGstType = customerImportCell(row, "GST Type")
      let gstType: PartyGstType = defaultPartyGstType(gstScheme)
      if (rawGstType) {
        const parsed = parsePartyGstType(rawGstType)
        if (parsed) gstType = parsed
        else
          rowErrors.push(
            `GST Type "${rawGstType}" is not one of: ${PARTY_GST_TYPE_OPTIONS.map((o) => o.label).join(", ")}`,
          )
      }

      // The form picks State from the State list and City from that State's
      // cities — the import holds a typed name to the same lists.
      const rawState = customerImportCell(row, "State")
      const rawCity = customerImportCell(row, "City")
      const state = rawState ? stateByName.get(rawState.toLowerCase()) : undefined
      let cityName = ""
      if (rawState && !state) {
        rowErrors.push(`State "${rawState}" is not in the State list${suggestFrom(rawState, namesAsCandidates(states.map((st) => st.name)))}`)
      }
      if (rawCity) {
        if (!rawState) {
          rowErrors.push("City needs a State")
        } else if (state) {
          const match = cityByStateAndName.get(`${state.id}:${rawCity.toLowerCase()}`)
          if (match) cityName = match
          else
            rowErrors.push(
              `City "${rawCity}" is not in ${state.name}'s city list${suggestFrom(
                rawCity,
                namesAsCandidates(cities.filter((city) => city.stateId === state.id).map((city) => city.name)),
                { listUpTo: 0 },
              )}`,
            )
        }
      }

      const input: CustomerInput = {
        name: customerImportCell(row, "Party Name"),
        phone: customerImportCell(row, "Phone"),
        altPhone: customerImportCell(row, "Alternate Phone"),
        email: customerImportCell(row, "Email"),
        address: customerImportCell(row, "Address"),
        city: cityName,
        state: state?.name ?? "",
        pincode: customerImportCell(row, "Pincode"),
        gstNumber: customerImportCell(row, "GST Number"),
        gstType,
        panNumber: customerImportCell(row, "PAN Number"),
        aadhaarNumber: customerImportCell(row, "Aadhaar Number"),
        registrationId: customerImportCell(row, "Registration Id"),
        notes: customerImportCell(row, "Notes"),
      }

      const fieldErrors = validateCustomerInput(input, { gstScheme })
      for (const messages of Object.values(fieldErrors)) rowErrors.push(...messages)

      const phone = input.phone.trim()
      if (phone) {
        const earlierLine = firstLineByPhone.get(phone)
        const existingParty = partyByPhone.get(phone)
        if (earlierLine) {
          rowErrors.push(`Phone number "${phone}" is duplicated in this file${earlierRowHint(earlierLine)}`)
        } else if (existingParty) {
          rowErrors.push(
            `A party with phone number "${phone}" already exists${existingRecordHint(
              { name: existingParty.name, ref: existingParty.customerCode ?? existingParty.vendorCode },
              "Remove this row, or edit that party instead",
            )}`,
          )
        }
        if (!earlierLine) firstLineByPhone.set(phone, line)
      }

      const rawOpeningBalance = customerImportCell(row, "Opening Balance")
      const openingBalance = rawOpeningBalance === "" ? 0 : Number(rawOpeningBalance)
      if (!Number.isFinite(openingBalance)) {
        rowErrors.push("Opening Balance must be a number")
      }

      if (rowErrors.length) {
        for (const message of rowErrors) errors.push(`Row ${line}: ${message}`)
        continue
      }

      toCreate.push({
        storeId,
        name: input.name.trim(),
        phone: phone || null,
        alternatePhone: input.altPhone?.trim() || null,
        email: input.email?.trim() || null,
        addressLine1: input.address?.trim() || null,
        city: input.city || null,
        state: input.state || null,
        pincode: input.pincode?.trim() || null,
        gstin: input.gstNumber?.trim() ? normalizeGstin(input.gstNumber) : null,
        gstType,
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
    return { success: false, message: actionErrorMessage(error, "Failed to import parties.") }
  }
}
