// lib/actions/customer-ledger-actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { LedgerEntryType } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireStoreScope, getStoreIdForRead } from "@/lib/store-context"
import { actionErrorMessage } from "@/lib/action-error";
import { formatLedgerSource } from "@/lib/ledger-format"
import { sendMail } from "@/lib/mailer"
import { ledgerStatementEmail } from "@/lib/email-templates"
import { resolveStoreName } from "@/lib/invite-email"
import { formatShortDate } from "@/lib/utils"
import { MONEY_UNIT } from "@/lib/business-units"
import { getActiveBusinessUnits } from "@/lib/business-units.server"
import { logger } from "@/lib/logger";

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
  /** Raw ISO timestamp — entryDate above is pre-formatted for the emailed
   * statement, this is what the on-screen ledger table sorts by. */
  entryDateISO: string
  invoiceId: string | null
  invoiceNumber: string | null
  creditNoteId: string | null
  creditNoteNumber: string | null
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
  return formatShortDate(date)
}

export async function getCustomerLedgerEntries(
  customerId: string
): Promise<CustomerLedgerEntryItem[]> {
  const storeId = await getStoreIdForRead()

  const entries = await prisma.ledgerEntry.findMany({
    where: { customerId, storeId },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    include: {
      invoice: { select: { id: true, invoiceNumber: true } },
      creditNote: { select: { id: true, creditNoteNumber: true } },
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
    entryDateISO: entry.entryDate.toISOString(),
    invoiceId: entry.invoice?.id ?? null,
    invoiceNumber: entry.invoice?.invoiceNumber ?? null,
    creditNoteId: entry.creditNote?.id ?? null,
    creditNoteNumber: entry.creditNote?.creditNoteNumber ?? null,
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
  const storeId = await getStoreIdForRead()

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

  const weightTotals = new Map<string, { debit: number; credit: number; hasEntry: boolean }>(
    nonMoneyUnits.map((unit) => [unit.value, { debit: 0, credit: 0, hasEntry: false }]),
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
    bucket.hasEntry = true
  }

  // Only units this customer has an actual ledger entry in — a store might
  // deal in Diamond/Silver/Gold generally, but a customer who's only ever
  // bought Gold has nothing meaningful to show for the other two; a
  // "0.000 g" card for something they've never transacted in just reads as
  // clutter, not information.
  const unitSummaries: CustomerLedgerUnitSummary[] = nonMoneyUnits
    .filter((unit) => weightTotals.get(unit.value)?.hasEntry)
    .map((unit) => {
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
      return { success: false, message: "Party not found" }
    }

    if (!customer.email) {
      return { success: false, message: "This party has no email on file" }
    }

    const [entries, summary, storeName] = await Promise.all([
      getCustomerLedgerEntries(customerId),
      getCustomerLedgerSummary(customerId),
      resolveStoreName(storeId),
    ])

    if (!summary) {
      return { success: false, message: "Party not found" }
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
    logger.error("emailLedgerStatementAction error", error)
    return { success: false, message: actionErrorMessage(error, "Failed to email statement") }
  }
}