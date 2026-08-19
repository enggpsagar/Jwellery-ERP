// lib/actions/customer-ledger-actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { LedgerEntryType, LedgerSourceType } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"
import { formatLedgerSource } from "@/lib/ledger-format"
import { sendMail } from "@/lib/mailer"
import { ledgerStatementEmail } from "@/lib/email-templates"

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
  entryDate: string
  invoiceId: string | null
  invoiceNumber: string | null
}

export type CustomerLedgerSummary = {
  openingBalance: number
  ledgerDebitTotal: number
  ledgerCreditTotal: number
  currentBalance: number
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
    },
  })

  return entries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    sourceType: formatLedgerSource(entry.sourceType),
    description: entry.description ?? "",
    amount: Number(entry.amount ?? 0),
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

  const entries = await prisma.ledgerEntry.findMany({
    where: { customerId, storeId },
    select: {
      type: true,
      amount: true,
    },
  })

  const openingBalance = Number(customer.openingBalance ?? 0)

  let ledgerDebitTotal = 0
  let ledgerCreditTotal = 0

  for (const entry of entries) {
    const amount = Number(entry.amount ?? 0)

    if (entry.type === LedgerEntryType.DEBIT) {
      ledgerDebitTotal += amount
    } else if (entry.type === LedgerEntryType.CREDIT) {
      ledgerCreditTotal += amount
    }
  }

  return {
    openingBalance,
    ledgerDebitTotal,
    ledgerCreditTotal,
    currentBalance: openingBalance + ledgerDebitTotal - ledgerCreditTotal,
  }
}

export async function addCustomerSaleEntry(
  customerId: string,
  prevState: CustomerLedgerFormState,
  formData: FormData
): Promise<CustomerLedgerFormState> {
  try {
    const amount = toNumber(formData.get("amount"), 0)
    const description = String(formData.get("description") || "").trim()

    const errors: Record<string, string[]> = {}

    if (!amount || amount <= 0) {
      errors.amount = ["Amount must be greater than 0"]
    }

    if (Object.keys(errors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors,
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
        amount,
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
    const amount = toNumber(formData.get("amount"), 0)
    const description = String(formData.get("description") || "").trim()

    const errors: Record<string, string[]> = {}

    if (!amount || amount <= 0) {
      errors.amount = ["Amount must be greater than 0"]
    }

    if (Object.keys(errors).length > 0) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors,
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
        amount,
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