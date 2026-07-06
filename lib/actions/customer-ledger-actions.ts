// lib/actions/customer-ledger-actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { LedgerEntryType, LedgerSourceType } from "@prisma/client"

import { prisma } from "@/lib/prisma"

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

function formatLedgerSource(
  sourceType: LedgerSourceType | string | null | undefined
) {
  if (!sourceType) return "Manual"

  switch (sourceType) {
    case LedgerSourceType.MANUAL:
      return "Manual"
    case LedgerSourceType.SALE:
      return "Sale"
    case LedgerSourceType.PURCHASE:
      return "Purchase"
    case LedgerSourceType.KARIGAR_ISSUE:
      return "Karigar Issue"
    case LedgerSourceType.KARIGAR_RECEIPT:
      return "Karigar Receipt"
    case LedgerSourceType.ADJUSTMENT:
      return "Adjustment"
    default:
      return String(sourceType)
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase())
  }
}

export async function getCustomerLedgerEntries(
  customerId: string
): Promise<CustomerLedgerEntryItem[]> {
  const entries = await prisma.ledgerEntry.findMany({
    where: { customerId },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
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

export async function getCustomerLedgerSummary(
  customerId: string
): Promise<CustomerLedgerSummary | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { openingBalance: true },
  })

  if (!customer) return null

  const entries = await prisma.ledgerEntry.findMany({
    where: { customerId },
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

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
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

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
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