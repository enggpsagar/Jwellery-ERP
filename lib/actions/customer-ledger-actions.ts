// lib/actions/customer-ledger-actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { LedgerEntryType, LedgerSourceType } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"
import { formatLedgerSource } from "@/lib/ledger-format"
import { sendMail } from "@/lib/mailer"
import { ledgerStatementEmail } from "@/lib/email-templates"
import {
  classifyMetalName,
  BUSINESS_UNIT_LABELS,
  type BusinessUnit,
} from "@/lib/business-units"
import { getActiveBusinessUnits } from "@/lib/business-units.server"

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
  entryDate: string
  invoiceId: string | null
  invoiceNumber: string | null
}

export type CustomerLedgerUnitSummary = {
  unit: BusinessUnit
  label: string
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
    entryDate: formatDate(entry.entryDate),
    invoiceId: entry.invoice?.id ?? null,
    invoiceNumber: entry.invoice?.invoiceNumber ?? null,
  }))
}

export async function getCustomerLedgerSummary(
  customerId: string
): Promise<CustomerLedgerSummary | null> {
  const storeId = await requireStoreScope()

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId },
    select: { openingBalance: true },
  })

  if (!customer) return null

  const [entries, activeUnits] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { customerId, storeId },
      select: {
        type: true,
        amount: true,
        metalWeight: true,
        metalWeightFine: true,
        metalType: { select: { name: true } },
      },
    }),
    getActiveBusinessUnits(),
  ])

  const openingBalance = Number(customer.openingBalance ?? 0)

  let ledgerDebitTotal = 0
  let ledgerCreditTotal = 0

  const weightTotals: Record<string, { debit: number; credit: number }> = {
    GOLD: { debit: 0, credit: 0 },
    SILVER: { debit: 0, credit: 0 },
    DIAMOND: { debit: 0, credit: 0 },
  }

  for (const entry of entries) {
    const amount = Number(entry.amount ?? 0)
    const isDebit = entry.type === LedgerEntryType.DEBIT

    if (isDebit) {
      ledgerDebitTotal += amount
    } else {
      ledgerCreditTotal += amount
    }

    const family = classifyMetalName(entry.metalType?.name)
    if (family === "OTHER") continue

    const value =
      family === "DIAMOND"
        ? amount
        : Number(entry.metalWeightFine ?? entry.metalWeight ?? 0)

    weightTotals[family][isDebit ? "debit" : "credit"] += value
  }

  const unitSummaries: CustomerLedgerUnitSummary[] = activeUnits
    .filter((unit) => unit !== "MONEY")
    .map((unit) => {
      const debitTotal = weightTotals[unit]?.debit ?? 0
      const creditTotal = weightTotals[unit]?.credit ?? 0

      return {
        unit,
        label: BUSINESS_UNIT_LABELS[unit],
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
    moneyActive: activeUnits.includes("MONEY"),
    unitSummaries,
  }
}

type ManualEntryFields = {
  amount: number
  metalTypeId: string | null
  metalWeight: number | null
  metalWeightFine: number | null
}

/**
 * A manual ledger entry can be denominated in money (a ₹ amount) or, for a
 * business that also deals in Gold/Silver, in a metal weight instead — the
 * unit picked in the dialog decides which fields formData actually carries.
 * Diamond is value-based (see lib/business-units.ts), so it's parsed the
 * same way Money is, just tagged with a Diamond metalTypeId.
 */
function parseManualEntryFields(
  formData: FormData,
): { ok: true; fields: ManualEntryFields } | { ok: false; errors: Record<string, string[]> } {
  const unit = String(formData.get("unit") || "MONEY") as BusinessUnit
  const errors: Record<string, string[]> = {}

  if (unit === "GOLD" || unit === "SILVER") {
    const metalTypeId = String(formData.get("metalTypeId") || "").trim()
    const weight = toNumber(formData.get("weight"), 0)

    if (!metalTypeId) {
      errors.metalTypeId = [`Select which ${unit.toLowerCase()} type this entry is for`]
    }

    if (!weight || weight <= 0) {
      errors.weight = ["Weight must be greater than 0"]
    }

    if (Object.keys(errors).length > 0) return { ok: false, errors }

    return {
      ok: true,
      fields: { amount: 0, metalTypeId, metalWeight: weight, metalWeightFine: weight },
    }
  }

  const amount = toNumber(formData.get("amount"), 0)

  if (!amount || amount <= 0) {
    errors.amount = ["Amount must be greater than 0"]
    return { ok: false, errors }
  }

  const metalTypeId =
    unit === "DIAMOND" ? String(formData.get("metalTypeId") || "").trim() || null : null

  if (unit === "DIAMOND" && !metalTypeId) {
    return {
      ok: false,
      errors: { metalTypeId: ["Select which diamond type this entry is for"] },
    }
  }

  return { ok: true, fields: { amount, metalTypeId, metalWeight: null, metalWeightFine: null } }
}

export async function addCustomerSaleEntry(
  customerId: string,
  prevState: CustomerLedgerFormState,
  formData: FormData
): Promise<CustomerLedgerFormState> {
  try {
    const parsed = parseManualEntryFields(formData)
    const description = String(formData.get("description") || "").trim()

    if (!parsed.ok) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: parsed.errors,
      }
    }

    const storeId = await requireStoreScope()

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
    const parsed = parseManualEntryFields(formData)
    const description = String(formData.get("description") || "").trim()

    if (!parsed.ok) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: parsed.errors,
      }
    }

    const storeId = await requireStoreScope()

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

    const [entries, summary, settings] = await Promise.all([
      getCustomerLedgerEntries(customerId),
      getCustomerLedgerSummary(customerId),
      prisma.businessSettings.findUnique({
        where: { storeId },
        select: { businessName: true },
      }),
    ])

    if (!summary) {
      return { success: false, message: "Customer not found" }
    }

    const { subject, html } = ledgerStatementEmail({
      storeName: settings?.businessName || "Your Store",
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