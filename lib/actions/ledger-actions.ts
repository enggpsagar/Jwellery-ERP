// lib/actions/ledger-actions.ts
"use server"

import { LedgerEntryType } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"
import { formatLedgerSource } from "@/lib/ledger-format"
import {
  classifyMetalName,
  BUSINESS_UNIT_LABELS,
  type BusinessUnit,
} from "@/lib/business-units"
import { getActiveBusinessUnits } from "@/lib/business-units.server"

export type LedgerEntryRow = {
  id: string
  dateISO: string
  date: string
  account: string
  accountInitials: string
  accountHref: string | null
  sourceType: string
  sourceLabel: string
  type: "CREDIT" | "DEBIT"
  amount: number
  metalType: string | null
  metalWeight: number | null
  description: string
  invoiceId: string | null
  invoiceNumber: string | null
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

/** Recent ledger activity across every customer and karigar account in the store. */
export async function getLedgerEntries(): Promise<LedgerEntryRow[]> {
  const storeId = await requireStoreScope()

  const entries = await prisma.ledgerEntry.findMany({
    where: { storeId },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      customer: { select: { id: true, name: true } },
      karigar: { select: { id: true, name: true } },
      invoice: { select: { id: true, invoiceNumber: true } },
      metalType: { select: { name: true } },
    },
  })

  return entries.map((entry) => {
    const accountName = entry.customer?.name ?? entry.karigar?.name ?? "—"
    const accountHref = entry.customer
      ? `/customers/${entry.customer.id}`
      : entry.karigar
        ? `/karigars/${entry.karigar.id}`
        : null

    return {
      id: entry.id,
      dateISO: entry.entryDate.toISOString().slice(0, 10),
      date: formatDate(entry.entryDate),
      account: accountName,
      accountInitials: initials(accountName),
      accountHref,
      sourceType: entry.sourceType,
      sourceLabel: formatLedgerSource(entry.sourceType),
      type: entry.type as "CREDIT" | "DEBIT",
      amount: Number(entry.amount ?? 0),
      metalType: entry.metalType?.name ?? null,
      metalWeight: entry.metalWeight ? Number(entry.metalWeight) : null,
      description: entry.description ?? "",
      invoiceId: entry.invoiceId,
      invoiceNumber: entry.invoice?.invoiceNumber ?? null,
    }
  })
}

export type KarigarLedgerRow = {
  id: string
  date: string
  type: "CREDIT" | "DEBIT"
  sourceLabel: string
  description: string
  metalWeightFine: number | null
  amount: number
  runningFineGoldBalance: number
  runningCashBalance: number
}

export type KarigarLedgerResult = {
  rows: KarigarLedgerRow[]
  finalFineGoldBalance: number
  finalCashBalance: number
}

/**
 * A single karigar's ledger, oldest first, with a running fine-gold balance
 * (gold currently out with the karigar) and running cash balance (labour
 * charges owed to the karigar) computed by walking the entries once.
 */
export async function getKarigarLedger(karigarId: string): Promise<KarigarLedgerResult> {
  const storeId = await requireStoreScope()

  const entries = await prisma.ledgerEntry.findMany({
    where: { storeId, karigarId },
    orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
  })

  let fineGoldBalance = 0
  let cashBalance = 0

  const rows: KarigarLedgerRow[] = entries.map((entry) => {
    const isDebit = entry.type === "DEBIT"
    const metalWeightFine = entry.metalWeightFine ? Number(entry.metalWeightFine) : null
    const amount = Number(entry.amount ?? 0)

    fineGoldBalance += (isDebit ? 1 : -1) * (metalWeightFine ?? 0)
    cashBalance += (isDebit ? 1 : -1) * amount

    return {
      id: entry.id,
      date: formatDate(entry.entryDate),
      type: entry.type as "CREDIT" | "DEBIT",
      sourceLabel: formatLedgerSource(entry.sourceType),
      description: entry.description ?? "",
      metalWeightFine,
      amount,
      runningFineGoldBalance: fineGoldBalance,
      runningCashBalance: cashBalance,
    }
  })

  return {
    rows,
    finalFineGoldBalance: fineGoldBalance,
    finalCashBalance: cashBalance,
  }
}

export type LedgerUnitTotal = {
  unit: BusinessUnit
  label: string
  debit: number
  credit: number
}

export type LedgerTotals = {
  totalDebit: number
  totalCredit: number
  todayCount: number
  moneyActive: boolean
  /** Debit/credit totals for each non-money unit this store is configured to also deal in. */
  unitTotals: LedgerUnitTotal[]
}

export async function getLedgerTotals(): Promise<LedgerTotals> {
  const storeId = await requireStoreScope()

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const activeUnits = await getActiveBusinessUnits()
  const nonMoneyUnits = activeUnits.filter((unit) => unit !== "MONEY")

  const [debitAgg, creditAgg, todayCount, metalEntries] = await Promise.all([
    prisma.ledgerEntry.aggregate({
      where: { storeId, type: LedgerEntryType.DEBIT },
      _sum: { amount: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { storeId, type: LedgerEntryType.CREDIT },
      _sum: { amount: true },
    }),
    prisma.ledgerEntry.count({
      where: { storeId, entryDate: { gte: startOfToday } },
    }),
    nonMoneyUnits.length
      ? prisma.ledgerEntry.findMany({
          where: { storeId, metalTypeId: { not: null } },
          select: {
            type: true,
            amount: true,
            metalWeight: true,
            metalWeightFine: true,
            metalType: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ])

  const weightTotals: Record<string, { debit: number; credit: number }> = {
    GOLD: { debit: 0, credit: 0 },
    SILVER: { debit: 0, credit: 0 },
    DIAMOND: { debit: 0, credit: 0 },
  }

  for (const entry of metalEntries) {
    const family = classifyMetalName(entry.metalType?.name)
    if (family === "OTHER") continue

    const isDebit = entry.type === LedgerEntryType.DEBIT
    const value =
      family === "DIAMOND"
        ? Number(entry.amount ?? 0)
        : Number(entry.metalWeightFine ?? entry.metalWeight ?? 0)

    weightTotals[family][isDebit ? "debit" : "credit"] += value
  }

  const unitTotals: LedgerUnitTotal[] = nonMoneyUnits.map((unit) => ({
    unit,
    label: BUSINESS_UNIT_LABELS[unit],
    debit: weightTotals[unit]?.debit ?? 0,
    credit: weightTotals[unit]?.credit ?? 0,
  }))

  return {
    totalDebit: Number(debitAgg._sum.amount ?? 0),
    totalCredit: Number(creditAgg._sum.amount ?? 0),
    todayCount,
    moneyActive: activeUnits.includes("MONEY"),
    unitTotals,
  }
}

export type MetalDailyUnitEntry = {
  unit: BusinessUnit
  label: string
  /** Grams for GOLD/SILVER, rupee value for DIAMOND — same convention as getLedgerTotals's weightTotals. */
  purchasedValue: number
  purchasedAmount: number
  soldValue: number
  soldAmount: number
  /** Running (purchasedValue - soldValue) since the earliest transaction, as of the end of this day. */
  closingBalance: number
}

export type MetalDailyRow = {
  dateISO: string
  date: string
  units: MetalDailyUnitEntry[]
}

export type MetalDailyLedgerResult = {
  /** Oldest first, one row per day that had at least one purchase or sale — matches a running balance reading top-to-bottom. */
  rows: MetalDailyRow[]
  activeUnits: BusinessUnit[]
}

/**
 * Daily Gold/Silver/Diamond purchased-vs-sold breakdown with a running
 * closing balance per metal, built from PurchaseItem/InvoiceItem/
 * KachaInvoiceItem (not LedgerEntry — a SALE/PURCHASE LedgerEntry only
 * carries a money balance-due amount, never metal weight/type, and is only
 * created when a balance is outstanding, so it can't answer "how much gold
 * moved today"). Only days with actual purchase/sale activity are
 * included; a metal absent from the store's configured business units
 * (Settings → Business Units) is omitted the same way getLedgerTotals
 * drops it from unitTotals.
 */
export async function getMetalDailyLedger(): Promise<MetalDailyLedgerResult> {
  const storeId = await requireStoreScope()

  const activeUnits = (await getActiveBusinessUnits()).filter((unit) => unit !== "MONEY")
  if (activeUnits.length === 0) {
    return { rows: [], activeUnits: [] }
  }

  const [purchaseItems, invoiceItems, kachaInvoiceItems] = await Promise.all([
    prisma.purchaseItem.findMany({
      where: { purchase: { storeId } },
      select: {
        netWeight: true,
        lineTotal: true,
        metalType: { select: { name: true } },
        purchase: { select: { purchaseDate: true } },
      },
    }),
    prisma.invoiceItem.findMany({
      where: { invoice: { storeId } },
      select: {
        netWeight: true,
        lineTotal: true,
        metalType: { select: { name: true } },
        invoice: { select: { invoiceDate: true } },
      },
    }),
    prisma.kachaInvoiceItem.findMany({
      where: { kachaInvoice: { storeId } },
      select: {
        netWeight: true,
        lineTotal: true,
        metalType: { select: { name: true } },
        kachaInvoice: { select: { invoiceDate: true } },
      },
    }),
  ])

  type DayTotals = Record<string, { purchasedValue: number; purchasedAmount: number; soldValue: number; soldAmount: number }>
  const byDay = new Map<string, DayTotals>()

  function dayTotals(dateISO: string): DayTotals {
    let totals = byDay.get(dateISO)
    if (!totals) {
      totals = {}
      byDay.set(dateISO, totals)
    }
    return totals
  }

  function unitTotals(totals: DayTotals, unit: BusinessUnit) {
    let entry = totals[unit]
    if (!entry) {
      entry = { purchasedValue: 0, purchasedAmount: 0, soldValue: 0, soldAmount: 0 }
      totals[unit] = entry
    }
    return entry
  }

  function valueFor(family: BusinessUnit, netWeight: unknown, amount: number) {
    return family === "DIAMOND" ? amount : Number(netWeight ?? 0)
  }

  for (const item of purchaseItems) {
    const family = classifyMetalName(item.metalType?.name)
    if (family === "OTHER" || !activeUnits.includes(family)) continue

    const dateISO = item.purchase.purchaseDate.toISOString().slice(0, 10)
    const amount = Number(item.lineTotal ?? 0)
    const entry = unitTotals(dayTotals(dateISO), family)
    entry.purchasedValue += valueFor(family, item.netWeight, amount)
    entry.purchasedAmount += amount
  }

  for (const item of [...invoiceItems, ...kachaInvoiceItems]) {
    const family = classifyMetalName(item.metalType?.name)
    if (family === "OTHER" || !activeUnits.includes(family)) continue

    const invoiceDate = "invoice" in item ? item.invoice.invoiceDate : item.kachaInvoice.invoiceDate
    const dateISO = invoiceDate.toISOString().slice(0, 10)
    const amount = Number(item.lineTotal ?? 0)
    const entry = unitTotals(dayTotals(dateISO), family)
    entry.soldValue += valueFor(family, item.netWeight, amount)
    entry.soldAmount += amount
  }

  const sortedDays = Array.from(byDay.keys()).sort()
  const runningBalance: Record<string, number> = {}

  const rows: MetalDailyRow[] = sortedDays.map((dateISO) => {
    const totals = byDay.get(dateISO)!

    const units: MetalDailyUnitEntry[] = activeUnits
      .filter((unit) => totals[unit])
      .map((unit) => {
        const entry = totals[unit]!
        const opening = runningBalance[unit] ?? 0
        const closingBalance = opening + entry.purchasedValue - entry.soldValue
        runningBalance[unit] = closingBalance

        return {
          unit,
          label: BUSINESS_UNIT_LABELS[unit],
          purchasedValue: entry.purchasedValue,
          purchasedAmount: entry.purchasedAmount,
          soldValue: entry.soldValue,
          soldAmount: entry.soldAmount,
          closingBalance,
        }
      })

    return {
      dateISO,
      date: formatDate(new Date(dateISO)),
      units,
    }
  })

  return { rows, activeUnits }
}
