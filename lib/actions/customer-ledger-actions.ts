// lib/actions/customer-ledger-actions.ts
"use server"

import { LedgerEntryType, type LedgerSourceType } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireStoreScope, getStoreIdForRead } from "@/lib/store-context"
import { actionErrorMessage } from "@/lib/action-error";
import { formatLedgerSource } from "@/lib/ledger-format"
import {
  partyBalanceDirection,
  partyLedgerDelta,
  type PartyBalanceDirection,
} from "@/lib/party-balance"
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

/** A purchase line's metal / stone, as the old Supplier Ledger listed it. */
export type PartyLedgerMetal = { label: string; weight: number; unit: "g" | "ct" }

/**
 * One row of a party's ONE ledger (user decision 2026-10-13): every
 * LedgerEntry where customerId = party OR vendorId = party — sales, sale
 * returns, purchases, payments in / out, exchanges, manual entries — oldest
 * first, with the running net balance after each row (lib/party-balance.ts:
 * positive = Receivable, negative = Payable).
 */
export type PartyLedgerRow = {
  id: string
  type: "DEBIT" | "CREDIT"
  /** Raw LedgerSourceType. */
  sourceType: string
  /** "Sale", "Purchase", "Payment In", "Payment Out", "Sale Return", … */
  label: string
  /** The source document's own number (invoice / purchase / credit note /
   *  order), shown next to the label and linked via href. */
  documentNumber: string | null
  href: string | null
  description: string
  paymentMethod: string | null
  /** Money columns. Exactly one is non-zero for a money entry; both are 0
   *  for a metal-only entry (e.g. stock added from this party). */
  debit: number
  credit: number
  /** Net balance after this row, starting from the opening balance. */
  balance: number
  /** Pre-formatted (dd MMM yyyy) for the emailed statement / export. */
  entryDate: string
  entryDateISO: string
  /** A metal-only entry's own unit (manual metal entries, stock added). */
  metalType: string | null
  metalWeight: number | null
  caratWeight: number | null
  /** What a purchase / customer exchange brought in, per metal + purity or
   *  stone — the detail the old Supplier Ledger showed. */
  metals: PartyLedgerMetal[]
  /** Add Stock from this party: the piece's purchase amount — information
   *  only, never part of the balance. */
  stockValue: number | null
}

export type PartyLedgerUnitSummary = {
  /** StoreMetal.id */
  unit: string
  label: string
  isGemstone: boolean
  debitTotal: number
  creditTotal: number
  currentBalance: number
}

export type PartyLedgerSummary = {
  openingBalance: number
  debitTotal: number
  creditTotal: number
  /** The party's one net balance — same figure as mapCustomer's. */
  netBalance: number
  direction: PartyBalanceDirection
  moneyActive: boolean
  /** Balance in each non-money unit this store deals in (sale-side metal
   *  entries), only for units the party has an entry in. */
  unitSummaries: PartyLedgerUnitSummary[]
  /** Metal / stones bought from this party, totalled. */
  metalsPurchased: PartyLedgerMetal[]
}

export type PartyLedger = {
  rows: PartyLedgerRow[]
  summary: PartyLedgerSummary
}

function formatDate(date?: Date | null) {
  return formatShortDate(date)
}

function rowLabel(sourceType: LedgerSourceType | string, isStockAdded: boolean) {
  switch (sourceType) {
    case "SALE":
      return "Sale"
    case "SALE_RETURN":
      return "Sale Return"
    case "MANUAL":
      return "Manual Entry"
    case "ADJUSTMENT":
      return isStockAdded ? "Stock Added" : "Adjustment"
    default:
      return formatLedgerSource(sourceType)
  }
}

/**
 * The party's whole ledger — see PartyLedgerRow. Store-scoped; returns null
 * for a party outside the store. The balance arithmetic is the same as
 * mapCustomer / getPartyNetBalances (lib/core/customer.ts): an entry with
 * both customerId and vendorId counts once.
 */
export async function getPartyLedger(customerId: string): Promise<PartyLedger | null> {
  const storeId = await getStoreIdForRead()

  const party = await prisma.customer.findFirst({
    where: { id: customerId, storeId },
    select: { openingBalance: true },
  })
  if (!party) return null

  const [entries, activeUnits] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: {
        storeId,
        OR: [{ customerId }, { vendorId: customerId, customerId: null }],
      },
      orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
      include: {
        invoice: { select: { id: true, invoiceNumber: true } },
        creditNote: { select: { id: true, creditNoteNumber: true } },
        draftOrder: { select: { id: true, orderNumber: true } },
        metalType: { select: { name: true } },
        // A purchase's (or customer exchange's) lines carry the metal and
        // weight its money entry doesn't.
        purchase: {
          select: {
            id: true,
            purchaseNumber: true,
            items: {
              select: {
                quantity: true,
                netWeight: true,
                caratWeight: true,
                purityLabel: true,
                stoneMetalTypeName: true,
                metalType: { select: { name: true, isGemstone: true } },
                components: {
                  select: {
                    kind: true,
                    netWeight: true,
                    purityLabel: true,
                    stoneMetalTypeName: true,
                    caratWeight: true,
                    metalType: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    getActiveBusinessUnits(),
  ])

  // An Add Stock entry has no stock FK; its description starts "Stock added
  // — <stock code>", so the piece (price, purity) is found by that code.
  const stockCodeOf = (description: string | null) => /^Stock added — (\S+)/.exec(description ?? "")?.[1] ?? null
  const stockCodes = entries
    .filter((entry) => entry.sourceType === "ADJUSTMENT")
    .map((entry) => stockCodeOf(entry.description))
    .filter((code): code is string => Boolean(code))
  const stockByCode = new Map(
    (stockCodes.length
      ? await prisma.inventoryStock.findMany({
          where: { storeId, stockCode: { in: stockCodes } },
          select: { stockCode: true, purchaseAmount: true, purityLabel: true },
        })
      : []
    ).map((stock) => [stock.stockCode, stock]),
  )

  // Per-piece weights × quantity, merged per metal + purity (or stone).
  // Only on the document's own value entry (the purchase's CREDIT, the
  // exchange's CREDIT) — a payment carrying the same purchaseId must not
  // repeat the metal.
  const metalsOf = (entry: (typeof entries)[number]): PartyLedgerMetal[] => {
    const isStockAdded = entry.sourceType === "ADJUSTMENT" && Boolean(entry.vendorId)
    if (isStockAdded && (entry.metalWeight || entry.metalWeightFine)) {
      const purity = stockByCode.get(stockCodeOf(entry.description) ?? "")?.purityLabel
      const fine = !purity && !entry.metalWeight && entry.metalWeightFine
      return [
        {
          label: `${entry.metalType?.name ?? "Metal"}${purity ? ` ${purity}` : fine ? " (fine)" : ""}`,
          weight: Number(entry.metalWeight ?? entry.metalWeightFine ?? 0),
          unit: "g",
        },
      ]
    }
    const isValueEntry =
      entry.type === "CREDIT" && (entry.sourceType === "PURCHASE" || entry.sourceType === "OLD_GOLD_EXCHANGE")
    if (!isValueEntry || !entry.purchase) return []
    const merged = new Map<string, PartyLedgerMetal>()
    const add = (line: PartyLedgerMetal) => {
      if (!(line.weight > 0)) return
      const key = `${line.label}|${line.unit}`
      const existing = merged.get(key)
      if (existing) existing.weight += line.weight
      else merged.set(key, line)
    }
    const metalLabel = (name: string | undefined, purity: string | null) =>
      [name, purity].filter(Boolean).join(" ") || "Metal"
    for (const item of entry.purchase.items) {
      const qty = item.quantity || 1
      // A multi-part line's own weights only summarise its rows.
      const metalRows = item.components.filter((row) => row.kind === "METAL")
      const stoneRows = item.components.filter((row) => row.kind === "STONE")
      if (metalRows.length) {
        for (const row of metalRows) {
          add({ label: metalLabel(row.metalType?.name, row.purityLabel), weight: Number(row.netWeight ?? 0) * qty, unit: "g" })
        }
      } else if (!(item.metalType?.isGemstone && Number(item.caratWeight ?? 0) > 0)) {
        // (An older line stocked under a gemstone is counted in carats below.)
        add({ label: metalLabel(item.metalType?.name, item.purityLabel), weight: Number(item.netWeight ?? 0) * qty, unit: "g" })
      }
      // The stone counts too — a gold piece set with a stone brings both.
      if (stoneRows.length) {
        for (const row of stoneRows) {
          add({ label: row.stoneMetalTypeName || "Stone", weight: Number(row.caratWeight ?? 0) * qty, unit: "ct" })
        }
      } else {
        add({
          label: item.stoneMetalTypeName || item.metalType?.name || "Stone",
          weight: Number(item.caratWeight ?? 0) * qty,
          unit: "ct",
        })
      }
    }
    return [...merged.values()]
  }

  const documentOf = (entry: (typeof entries)[number]): { number: string | null; href: string | null } => {
    if (entry.creditNote) {
      return { number: entry.creditNote.creditNoteNumber, href: `/billing/credit-notes/${entry.creditNote.id}` }
    }
    if (entry.purchase && (entry.sourceType !== "SALE" || !entry.invoice)) {
      return { number: entry.purchase.purchaseNumber, href: `/purchases/${entry.purchase.id}` }
    }
    if (entry.invoice) return { number: entry.invoice.invoiceNumber, href: `/billing/${entry.invoice.id}` }
    if (entry.draftOrder) return { number: entry.draftOrder.orderNumber, href: `/orders/${entry.draftOrder.id}` }
    return { number: null, href: null }
  }

  const openingBalance = Number(party.openingBalance ?? 0)
  let balance = openingBalance
  let debitTotal = 0
  let creditTotal = 0

  const rows: PartyLedgerRow[] = entries.map((entry) => {
    const amount = Number(entry.amount ?? 0)
    const delta = partyLedgerDelta({ type: entry.type, amount })
    balance = Math.round((balance + delta) * 100) / 100
    if (entry.type === LedgerEntryType.DEBIT) debitTotal += amount
    else creditTotal += amount
    const isStockAdded = entry.sourceType === "ADJUSTMENT" && Boolean(entry.vendorId)
    const doc = documentOf(entry)
    const stockAmount = isStockAdded
      ? stockByCode.get(stockCodeOf(entry.description) ?? "")?.purchaseAmount
      : null
    return {
      id: entry.id,
      type: entry.type,
      sourceType: entry.sourceType,
      label: rowLabel(entry.sourceType, isStockAdded),
      documentNumber: doc.number,
      href: doc.href,
      description: entry.description ?? "",
      paymentMethod: entry.paymentMethod ?? null,
      debit: entry.type === LedgerEntryType.DEBIT ? amount : 0,
      credit: entry.type === LedgerEntryType.CREDIT ? amount : 0,
      balance,
      entryDate: formatDate(entry.entryDate),
      entryDateISO: entry.entryDate.toISOString(),
      metalType: entry.metalType?.name ?? null,
      metalWeight: entry.metalWeight != null ? Number(entry.metalWeight) : null,
      caratWeight: entry.caratWeight != null ? Number(entry.caratWeight) : null,
      metals: metalsOf(entry),
      stockValue: stockAmount != null ? Number(stockAmount) : null,
    }
  })

  // Non-money balances bucket by each sale-side entry's own metalTypeId
  // against the store's configured business units — see getLedgerTotals in
  // ledger-actions.ts. Purchase-side metal is listed under metalsPurchased
  // instead (a "stock added" DEBIT means metal IN, the opposite of a
  // sale-side metal DEBIT, so the two are never summed together).
  const nonMoneyUnits = activeUnits.filter((unit) => unit.value !== MONEY_UNIT)
  const unitById = new Map(nonMoneyUnits.map((unit) => [unit.value, unit]))
  const weightTotals = new Map<string, { debit: number; credit: number; hasEntry: boolean }>(
    nonMoneyUnits.map((unit) => [unit.value, { debit: 0, credit: 0, hasEntry: false }]),
  )
  for (const entry of entries) {
    if (entry.customerId !== customerId || !entry.metalTypeId) continue
    const unit = unitById.get(entry.metalTypeId)
    if (!unit) continue
    const value = unit.isGemstone
      ? Number(entry.caratWeight ?? 0)
      : Number(entry.metalWeightFine ?? entry.metalWeight ?? 0)
    const bucket = weightTotals.get(unit.value)!
    bucket[entry.type === LedgerEntryType.DEBIT ? "debit" : "credit"] += value
    bucket.hasEntry = true
  }
  const unitSummaries: PartyLedgerUnitSummary[] = nonMoneyUnits
    .filter((unit) => weightTotals.get(unit.value)?.hasEntry)
    .map((unit) => {
      const debit = weightTotals.get(unit.value)?.debit ?? 0
      const credit = weightTotals.get(unit.value)?.credit ?? 0
      return {
        unit: unit.value,
        label: unit.label,
        isGemstone: unit.isGemstone,
        debitTotal: debit,
        creditTotal: credit,
        currentBalance: debit - credit,
      }
    })

  const purchased = new Map<string, PartyLedgerMetal>()
  for (const row of rows) {
    for (const metal of row.metals) {
      const key = `${metal.label}|${metal.unit}`
      const existing = purchased.get(key)
      if (existing) existing.weight += metal.weight
      else purchased.set(key, { ...metal })
    }
  }

  return {
    rows,
    summary: {
      openingBalance,
      debitTotal,
      creditTotal,
      netBalance: balance,
      direction: partyBalanceDirection(balance),
      moneyActive: activeUnits.some((unit) => unit.value === MONEY_UNIT),
      unitSummaries,
      metalsPurchased: [...purchased.values()],
    },
  }
}

/** Email this party's statement (the same unified rows) to its address. */
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

    const [ledger, storeName] = await Promise.all([getPartyLedger(customerId), resolveStoreName(storeId)])

    if (!ledger) {
      return { success: false, message: "Party not found" }
    }

    const { subject, html } = ledgerStatementEmail({
      storeName,
      customerName: customer.name,
      openingBalance: ledger.summary.openingBalance,
      debitTotal: ledger.summary.debitTotal,
      creditTotal: ledger.summary.creditTotal,
      netBalance: ledger.summary.netBalance,
      rows: ledger.rows.map((row) => ({
        entryDate: row.entryDate,
        label: row.documentNumber ? `${row.label} ${row.documentNumber}` : row.label,
        description: row.description,
        debit: row.debit,
        credit: row.credit,
        balance: row.balance,
      })),
    })

    const result = await sendMail({ to: customer.email, subject, html })

    return { success: result.sent, message: result.message }
  } catch (error) {
    logger.error("emailLedgerStatementAction error", error)
    return { success: false, message: actionErrorMessage(error, "Failed to email statement") }
  }
}
