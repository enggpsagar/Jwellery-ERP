// lib/actions/customer-ledger-actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { LedgerEntryType, LedgerSourceType } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"
import { formatLedgerSource } from "@/lib/ledger-format"
import { sendMail } from "@/lib/mailer"
import { ledgerStatementEmail } from "@/lib/email-templates"
import { resolveStoreName } from "@/lib/invite-email"
import { MONEY_UNIT } from "@/lib/business-units"
import { getActiveBusinessUnits, type BusinessUnitOption } from "@/lib/business-units.server"

export type CustomerLedgerFormState = {
  success: boolean
  message: string
  errors?: Record<string, string[]>
}

export type CustomerLedgerEntryItem = {
  id: string
  type: "DEBIT" | "CREDIT"
  sourceType: string
  description: string
  amount: number
  metalType: string | null
  metalWeight: number | null
  /** Carat quantity for a gemstone-unit entry — a gemstone is carat-based,
   * not weight-based (StoreMetal.isGemstone). */
  caratWeight: number | null
  paymentMethod: string | null
  entryDate: string
  invoiceId: string | null
  invoiceNumber: string | null
}

export type CustomerLedgerUnitSummary = {
  /** StoreMetal.id */
  unit: string
  label: string
  isGemstone: boolean
  debitTotal: number
  creditTotal: number
  currentBalance: number
}

export type CustomerLedgerSummary = {
  openingBalance: number
  ledgerDebitTotal: number
  ledgerCreditTotal: number
  currentBalance: number
  moneyActive: boolean
  /** Balance in each non-money unit this store is also configured to deal in. */
  unitSummaries: CustomerLedgerUnitSummary[]
}

function toNumber(value: FormDataEntryValue | null, fallback = 0) {
  if (value === null || value === "") return fallback
  const num = Number(value)
  return Number.isNaN(num) ? fallback : num
}

function formatDate(date?: Date | null) {
  if (!date) return "-"
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
}

export async function getCustomerLedgerEntries(
  customerId: string
): Promise<CustomerLedgerEntryItem[]> {
  const storeId = await requireStoreScope()

  const entries = await prisma.ledgerEntry.findMany({
    where: { customerId, storeId },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    include: {
      invoice: { select: { id: true, invoiceNumber: true } },
      metalType: { select: { name: true } },
    },
  })

  return entries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    sourceType: formatLedgerSource(entry.sourceType),
    description: entry.description ?? "",
    amount: Number(entry.amount ?? 0),
    metalType: entry.metalType?.name ?? null,
    metalWeight: entry.metalWeight ? Number(entry.metalWeight) : null,
    caratWeight: entry.caratWeight ? Number(entry.caratWeight) : null,
    paymentMethod: entry.paymentMethod ?? null,
    entryDate: formatDate(entry.entryDate),
    invoiceId: entry.invoice?.id ?? null,
    invoiceNumber: entry.invoice?.invoiceNumber ?? null,
  }))
}

/**
 * Non-money balances bucket by each entry's own `metalTypeId` FK against the
 * store's *currently configured* business-unit StoreMetal ids, rather than
 * name-substring-classifying `metalType.name` into a fixed Gold/Silver/
 * Diamond family — see getLedgerTotals's doc comment in ledger-actions.ts
 * for why: that old approach silently dropped any custom metal or
 * non-Diamond gemstone from these totals entirely.
 */
export async function getCustomerLedgerSummary(
  customerId: string
): Promise<CustomerLedgerSummary | null> {
  const storeId = await requireStoreScope()

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId },
    select: { openingBalance: true },
  })

  if (!customer) return null

  const activeUnits = await getActiveBusinessUnits()
  const nonMoneyUnits = activeUnits.filter((unit) => unit.value !== MONEY_UNIT)
  const unitById = new Map(nonMoneyUnits.map((unit) => [unit.value, unit]))

  const entries = await prisma.ledgerEntry.findMany({
    where: { customerId, storeId },
    select: {
      type: true,
      amount: true,
      metalTypeId: true,
      metalWeight: true,
      metalWeightFine: true,
      caratWeight: true,
    },
  })

  const openingBalance = Number(customer.openingBalance ?? 0)

  let ledgerDebitTotal = 0
  let ledgerCreditTotal = 0

  const weightTotals = new Map<string, { debit: number; credit: number }>(
    nonMoneyUnits.map((unit) => [unit.value, { debit: 0, credit: 0 }]),
  )

  for (const entry of entries) {
    const amount = Number(entry.amount ?? 0)
    const isDebit = entry.type === LedgerEntryType.DEBIT

    if (isDebit) {
      ledgerDebitTotal += amount
    } else {
      ledgerCreditTotal += amount
    }

    if (!entry.metalTypeId) continue
    const unit = unitById.get(entry.metalTypeId)
    if (!unit) continue

    // A gemstone unit is carat-based, not weight-based — reads its own
    // caratWeight column, never metalWeight/metalWeightFine or the rupee amount.
    const value = unit.isGemstone
      ? Number(entry.caratWeight ?? 0)
      : Number(entry.metalWeightFine ?? entry.metalWeight ?? 0)

    const bucket = weightTotals.get(unit.value)!
    bucket[isDebit ? "debit" : "credit"] += value
  }

  const unitSummaries: CustomerLedgerUnitSummary[] = nonMoneyUnits.map((unit) => {
    const debitTotal = weightTotals.get(unit.value)?.debit ?? 0
    const creditTotal = weightTotals.get(unit.value)?.credit ?? 0

    return {
      unit: unit.value,
      label: unit.label,
      isGemstone: unit.isGemstone,
      debitTotal,
      creditTotal,
      currentBalance: debitTotal - creditTotal,
    }
  })

  return {
    openingBalance,
    ledgerDebitTotal,
    ledgerCreditTotal,
    currentBalance: openingBalance + ledgerDebitTotal - ledgerCreditTotal,
    moneyActive: activeUnits.some((unit) => unit.value === MONEY_UNIT),
    unitSummaries,
  }
}

type ManualEntryFields = {
  amount: number
  metalTypeId: string | null
  metalWeight: number | null
  metalWeightFine: number | null
  caratWeight: number | null
}

/**
 * A manual ledger entry can be denominated in money (a ₹ amount) or, for a
 * business that also deals in a configured metal/gemstone unit, in a
 * quantity of that unit instead — the unit picked in the dialog decides
 * which fields formData actually carries. `unit` is now either "MONEY" or a
 * live StoreMetal.id directly (see business-units.server.ts's
 * BusinessUnitOption) — there's no separate "type within the unit" field
 * any more, since each configured business unit already *is* one specific
 * StoreMetal row. The unit's own `isGemstone` flag (resolved server-side
 * against the store's currently active units, not trusted from the form)
 * decides carat vs. gram, same as formatUnitValue.
 */
function parseManualEntryFields(
  formData: FormData,
  activeUnits: BusinessUnitOption[],
): { ok: true; fields: ManualEntryFields } | { ok: false; errors: Record<string, string[]> } {
  const unitValue = String(formData.get("unit") || MONEY_UNIT)
  const errors: Record<string, string[]> = {}

  if (unitValue !== MONEY_UNIT) {
    const unit = activeUnits.find((option) => option.value === unitValue)
    const weight = toNumber(formData.get("weight"), 0)

    if (!unit) {
      errors.unit = ["Select a valid unit"]
    }

    if (!weight || weight <= 0) {
      errors.weight = ["Weight must be greater than 0"]
    }

    if (!unit || Object.keys(errors).length > 0) return { ok: false, errors }

    if (unit.isGemstone) {
      return {
        ok: true,
        fields: { amount: 0, metalTypeId: unit.value, metalWeight: null, metalWeightFine: null, caratWeight: weight },
      }
    }

    return {
      ok: true,
      fields: { amount: 0, metalTypeId: unit.value, metalWeight: weight, metalWeightFine: weight, caratWeight: null },
    }
  }

  const amount = toNumber(formData.get("amount"), 0)

  if (!amount || amount <= 0) {
    errors.amount = ["Amount must be greater than 0"]
    return { ok: false, errors }
  }

  return {
    ok: true,
    fields: { amount, metalTypeId: null, metalWeight: null, metalWeightFine: null, caratWeight: null },
  }
}

export async function addCustomerSaleEntry(
  customerId: string,
  prevState: CustomerLedgerFormState,
  formData: FormData
): Promise<CustomerLedgerFormState> {
  try {
    const storeId = await requireStoreScope()
    const activeUnits = await getActiveBusinessUnits()
    const parsed = parseManualEntryFields(formData, activeUnits)
    const description = String(formData.get("description") || "").trim()

    if (!parsed.ok) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: parsed.errors,
      }
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: { id: true },
    })

    if (!customer) {
      return {
        success: false,
        message: "Customer not found",
      }
    }

    await prisma.ledgerEntry.create({
      data: {
        storeId,
        customerId,
        type: LedgerEntryType.DEBIT,
        sourceType: LedgerSourceType.MANUAL,
        ...parsed.fields,
        description: description || "Manual sale entry",
        entryDate: new Date(),
      },
    })

    revalidatePath("/customers")
    revalidatePath(`/customers/${customerId}`)

    return {
      success: true,
      message: "Sale entry added successfully",
    }
  } catch (error) {
    console.error("addCustomerSaleEntry error:", error)
    return {
      success: false,
      message: "Failed to add sale entry",
    }
  }
}

export async function addCustomerRefundEntry(
  customerId: string,
  prevState: CustomerLedgerFormState,
  formData: FormData
): Promise<CustomerLedgerFormState> {
  try {
    const storeId = await requireStoreScope()
    const activeUnits = await getActiveBusinessUnits()
    const parsed = parseManualEntryFields(formData, activeUnits)
    const description = String(formData.get("description") || "").trim()

    if (!parsed.ok) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: parsed.errors,
      }
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: { id: true },
    })

    if (!customer) {
      return {
        success: false,
        message: "Customer not found",
      }
    }

    await prisma.ledgerEntry.create({
      data: {
        storeId,
        customerId,
        type: LedgerEntryType.CREDIT,
        sourceType: LedgerSourceType.MANUAL,
        ...parsed.fields,
        description: description || "Manual refund / payment received entry",
        entryDate: new Date(),
      },
    })

    revalidatePath("/customers")
    revalidatePath(`/customers/${customerId}`)

    return {
      success: true,
      message: "Refund entry added successfully",
    }
  } catch (error) {
    console.error("addCustomerRefundEntry error:", error)
    return {
      success: false,
      message: "Failed to add refund entry",
    }
  }
}

/** Email this customer's current ledger statement to the address on file. */
export async function emailLedgerStatementAction(
  customerId: string
): Promise<CustomerLedgerFormState> {
  try {
    const storeId = await requireStoreScope()

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: { name: true, email: true },
    })

    if (!customer) {
      return { success: false, message: "Customer not found" }
    }

    if (!customer.email) {
      return { success: false, message: "This customer has no email on file" }
    }

    const [entries, summary, storeName] = await Promise.all([
      getCustomerLedgerEntries(customerId),
      getCustomerLedgerSummary(customerId),
      resolveStoreName(storeId),
    ])

    if (!summary) {
      return { success: false, message: "Customer not found" }
    }

    const { subject, html } = ledgerStatementEmail({
      storeName,
      customerName: customer.name,
      openingBalance: summary.openingBalance,
      ledgerDebitTotal: summary.ledgerDebitTotal,
      ledgerCreditTotal: summary.ledgerCreditTotal,
      currentBalance: summary.currentBalance,
      entries: entries.map((entry) => ({
        entryDate: entry.entryDate,
        sourceType: entry.sourceType,
        description: entry.description,
        type: entry.type,
        amount: entry.amount,
        invoiceNumber: entry.invoiceNumber,
      })),
    })

    const result = await sendMail({ to: customer.email, subject, html })

    return { success: result.sent, message: result.message }
  } catch (error) {
    console.error("emailLedgerStatementAction error:", error)
    return { success: false, message: "Failed to email statement" }
  }
}