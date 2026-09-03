// lib/actions/ledger-actions.ts
"use server"

import { LedgerEntryType, InvoiceStatus } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"
import { getLocationScope, locationWhere } from "@/lib/location-scope"
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
  /** Carat quantity for a Diamond entry — Diamond is carat-based, not
   * weight-based (see business-units.ts's CARAT_BASED_UNITS), so it never
   * shares metalWeight with Gold/Silver. */
  caratWeight: number | null
  paymentMethod: string | null
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
  const scope = await getLocationScope()

  const entries = await prisma.ledgerEntry.findMany({
    where: { storeId, ...locationWhere(scope) },
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
      caratWeight: entry.caratWeight ? Number(entry.caratWeight) : null,
      paymentMethod: entry.paymentMethod ?? null,
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
  /** This entry's own metal, e.g. "Gold" or "Silver" — a karigar can work
   *  different metals across different jobs, so this is read per-entry
   *  rather than assumed from the karigar overall. */
  metalType: string | null
  paymentMethod: string | null
  amount: number
  runningFineGoldBalance: number
  runningCashBalance: number
}

export type KarigarLedgerResult = {
  rows: KarigarLedgerRow[]
  finalFineGoldBalance: number
  finalCashBalance: number
  /** The metal name to use in "Fine X Balance"/"Running X Balance" labels —
   *  whichever metal this karigar's entries actually carry, so a
   *  silver-only karigar's ledger doesn't read "gold" throughout. Falls
   *  back to "Metal" when entries mix more than one, or carry none. */
  metalLabel: string
}

/**
 * A single karigar's ledger, oldest first, with a running fine-metal balance
 * (metal currently out with the karigar) and running cash balance (labour
 * charges owed to the karigar) computed by walking the entries once.
 */
export async function getKarigarLedger(karigarId: string): Promise<KarigarLedgerResult> {
  const storeId = await requireStoreScope()

  const entries = await prisma.ledgerEntry.findMany({
    where: { storeId, karigarId },
    orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
    include: { metalType: { select: { name: true } } },
  })

  let fineGoldBalance = 0
  let cashBalance = 0
  const metalNames = new Set<string>()

  const rows: KarigarLedgerRow[] = entries.map((entry) => {
    const isDebit = entry.type === "DEBIT"
    const metalWeightFine = entry.metalWeightFine ? Number(entry.metalWeightFine) : null
    const amount = Number(entry.amount ?? 0)
    const metalType = entry.metalType?.name ?? null
    if (metalType) metalNames.add(metalType)

    fineGoldBalance += (isDebit ? 1 : -1) * (metalWeightFine ?? 0)
    cashBalance += (isDebit ? 1 : -1) * amount

    return {
      id: entry.id,
      date: formatDate(entry.entryDate),
      type: entry.type as "CREDIT" | "DEBIT",
      sourceLabel: formatLedgerSource(entry.sourceType),
      description: entry.description ?? "",
      metalWeightFine,
      metalType,
      paymentMethod: entry.paymentMethod ?? null,
      amount,
      runningFineGoldBalance: fineGoldBalance,
      runningCashBalance: cashBalance,
    }
  })

  const metalLabel = metalNames.size === 1 ? [...metalNames][0] : "Metal"

  return {
    rows,
    finalFineGoldBalance: fineGoldBalance,
    finalCashBalance: cashBalance,
    metalLabel,
  }
}

export type KarigarLedgerSummaryRow = {
  id: string
  name: string
  code: string | null
  openingGold: number
  openingCash: number
  goldIssued: number
  goldUsed: number
  outstandingGold: number
  itemsDelivered: number
  totalEarned: number
  totalPaid: number
  outstandingCash: number
}

export type KarigarLedgerSummary = {
  rows: KarigarLedgerSummaryRow[]
  totals: {
    outstandingGold: number
    totalEarned: number
    totalPaid: number
    outstandingCash: number
  }
}

/**
 * One row per karigar across the whole store: lifetime gold issued vs. gold
 * used in delivered items (so the two "how much gold" halves of the ask are
 * both visible), the resulting outstanding fine-gold balance, items
 * delivered, and the cash side (labour earned vs. paid). Outstanding
 * gold/cash are derived the same way getKarigarLedger's running balance is
 * (walking DEBIT/CREDIT entries only) — opening gold/cash are shown as their
 * own reference columns, not folded in, to match the per-karigar detail page.
 */
export async function getKarigarLedgerSummary(): Promise<KarigarLedgerSummary> {
  const storeId = await requireStoreScope()

  const karigars = await prisma.karigar.findMany({
    where: { storeId },
    select: { id: true, name: true, code: true, openingGold: true, openingCash: true },
    orderBy: { name: "asc" },
  })

  const grouped = await prisma.ledgerEntry.groupBy({
    by: ["karigarId", "type", "sourceType"],
    where: { storeId, karigarId: { not: null } },
    _sum: { metalWeightFine: true, amount: true },
  })

  const receivedJobs = await prisma.karigarJob.findMany({
    where: { storeId, status: "received" },
    select: { karigarId: true, _count: { select: { receiptItems: true } } },
  })
  const itemsByKarigar = new Map<string, number>()
  for (const job of receivedJobs) {
    itemsByKarigar.set(job.karigarId, (itemsByKarigar.get(job.karigarId) ?? 0) + job._count.receiptItems)
  }

  const rows = karigars.map((karigar) => {
    let goldIssued = 0
    let goldUsed = 0
    let totalEarned = 0
    let totalPaid = 0

    for (const g of grouped) {
      if (g.karigarId !== karigar.id) continue
      const fine = Number(g._sum.metalWeightFine ?? 0)
      const amt = Number(g._sum.amount ?? 0)

      if (g.type === "DEBIT" && g.sourceType === "KARIGAR_ISSUE") goldIssued += fine
      else if (g.type === "CREDIT" && g.sourceType === "KARIGAR_RECEIPT") goldUsed += fine
      else if (g.type === "DEBIT") totalEarned += amt
      else if (g.type === "CREDIT") totalPaid += amt
    }

    return {
      id: karigar.id,
      name: karigar.name,
      code: karigar.code,
      openingGold: Number(karigar.openingGold),
      openingCash: Number(karigar.openingCash),
      goldIssued,
      goldUsed,
      outstandingGold: goldIssued - goldUsed,
      itemsDelivered: itemsByKarigar.get(karigar.id) ?? 0,
      totalEarned,
      totalPaid,
      outstandingCash: totalEarned - totalPaid,
    }
  })

  const totals = rows.reduce(
    (acc, row) => {
      acc.outstandingGold += row.outstandingGold
      acc.totalEarned += row.totalEarned
      acc.totalPaid += row.totalPaid
      acc.outstandingCash += row.outstandingCash
      return acc
    },
    { outstandingGold: 0, totalEarned: 0, totalPaid: 0, outstandingCash: 0 },
  )

  return { rows, totals }
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
  const scope = await getLocationScope()

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const activeUnits = await getActiveBusinessUnits()
  const nonMoneyUnits = activeUnits.filter((unit) => unit !== "MONEY")

  const [debitAgg, creditAgg, todayCount, metalEntries] = await Promise.all([
    prisma.ledgerEntry.aggregate({
      where: { storeId, type: LedgerEntryType.DEBIT, ...locationWhere(scope) },
      _sum: { amount: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { storeId, type: LedgerEntryType.CREDIT, ...locationWhere(scope) },
      _sum: { amount: true },
    }),
    prisma.ledgerEntry.count({
      where: { storeId, entryDate: { gte: startOfToday }, ...locationWhere(scope) },
    }),
    nonMoneyUnits.length
      ? prisma.ledgerEntry.findMany({
          where: { storeId, metalTypeId: { not: null }, ...locationWhere(scope) },
          select: {
            type: true,
            amount: true,
            metalWeight: true,
            metalWeightFine: true,
            caratWeight: true,
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
    // Diamond is carat-based, not weight-based — see business-units.ts's
    // CARAT_BASED_UNITS — so it reads its own caratWeight column, never the
    // Gold/Silver metalWeight/metalWeightFine columns.
    const value =
      family === "DIAMOND"
        ? Number(entry.caratWeight ?? 0)
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
  /** Grams for GOLD/SILVER, carats for DIAMOND — same convention as getLedgerTotals's weightTotals. */
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

  const scope = await getLocationScope()

  const [purchaseItems, invoiceItems, kachaInvoiceItems] = await Promise.all([
    prisma.purchaseItem.findMany({
      where: { purchase: { storeId, ...locationWhere(scope) } },
      select: {
        netWeight: true,
        caratWeight: true,
        lineTotal: true,
        metalType: { select: { name: true } },
        purchase: { select: { purchaseDate: true } },
      },
    }),
    prisma.invoiceItem.findMany({
      where: {
        invoice: { storeId, status: { not: InvoiceStatus.CANCELLED }, ...locationWhere(scope) },
      },
      select: {
        netWeight: true,
        caratWeight: true,
        lineTotal: true,
        metalType: { select: { name: true } },
        invoice: { select: { invoiceDate: true } },
      },
    }),
    prisma.kachaInvoiceItem.findMany({
      where: { kachaInvoice: { storeId, ...locationWhere(scope) } },
      select: {
        netWeight: true,
        caratWeight: true,
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

  // Diamond is carat-based, not weight-based (see business-units.ts's
  // CARAT_BASED_UNITS) — its "quantity" is caratWeight, never the line's
  // rupee amount.
  function valueFor(family: BusinessUnit, netWeight: unknown, caratWeight: unknown) {
    return family === "DIAMOND" ? Number(caratWeight ?? 0) : Number(netWeight ?? 0)
  }

  for (const item of purchaseItems) {
    const family = classifyMetalName(item.metalType?.name)
    if (family === "OTHER" || !activeUnits.includes(family)) continue

    const dateISO = item.purchase.purchaseDate.toISOString().slice(0, 10)
    const amount = Number(item.lineTotal ?? 0)
    const entry = unitTotals(dayTotals(dateISO), family)
    entry.purchasedValue += valueFor(family, item.netWeight, item.caratWeight)
    entry.purchasedAmount += amount
  }

  for (const item of [...invoiceItems, ...kachaInvoiceItems]) {
    const family = classifyMetalName(item.metalType?.name)
    if (family === "OTHER" || !activeUnits.includes(family)) continue

    const invoiceDate = "invoice" in item ? item.invoice.invoiceDate : item.kachaInvoice.invoiceDate
    const dateISO = invoiceDate.toISOString().slice(0, 10)
    const amount = Number(item.lineTotal ?? 0)
    const entry = unitTotals(dayTotals(dateISO), family)
    entry.soldValue += valueFor(family, item.netWeight, item.caratWeight)
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
