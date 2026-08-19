// lib/actions/ledger-actions.ts
"use server"

import { LedgerEntryType } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"
import { formatLedgerSource } from "@/lib/ledger-format"

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
      metalType: entry.metalType,
      metalWeight: entry.metalWeight ? Number(entry.metalWeight) : null,
      description: entry.description ?? "",
      invoiceId: entry.invoiceId,
      invoiceNumber: entry.invoice?.invoiceNumber ?? null,
    }
  })
}

export type LedgerTotals = {
  totalDebit: number
  totalCredit: number
  todayCount: number
}

export async function getLedgerTotals(): Promise<LedgerTotals> {
  const storeId = await requireStoreScope()

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const [debitAgg, creditAgg, todayCount] = await Promise.all([
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
  ])

  return {
    totalDebit: Number(debitAgg._sum.amount ?? 0),
    totalCredit: Number(creditAgg._sum.amount ?? 0),
    todayCount,
  }
}
