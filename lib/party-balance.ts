/**
 * One net balance per Party — the single definition every screen uses
 * (Parties list, side panel, detail page, export, payment pickers, dues
 * report, dashboard). Pure and client-safe: no Prisma import, so client
 * components can format with it too. The DB side (summing a store's ledger)
 * lives in `getPartyNetBalances` in lib/core/customer.ts and feeds these
 * same helpers.
 *
 * Sign convention (user decision 2026-10-13): one money ledger per party.
 *   net = openingBalance + Σ(DEBIT − CREDIT) over every LedgerEntry whose
 *         customerId = party OR vendorId = party.
 * Sale DEBITs and Payment-Out DEBITs raise it; Payment-In, Purchase,
 * Sale-Return and Customer-Exchange CREDITs lower it. Positive = the party
 * owes the store (Receivable); negative = the store owes the party
 * (Payable). openingBalance is stored signed the same way.
 *
 * An entry carrying both customerId and vendorId (none is written today)
 * counts once, on the customer side — `getPartyNetBalances` and
 * mapCustomer both skip vendor-side rows that also have a customerId.
 */

export type PartyBalanceDirection = "Receivable" | "Payable" | "Settled"

/** Below half a paisa the balance reads as settled. */
const SETTLED_EPSILON = 0.005

export type PartyLedgerMovement = {
  type: "DEBIT" | "CREDIT" | string
  amount: unknown
}

/** A single entry's effect on the party's net balance. */
export function partyLedgerDelta(entry: PartyLedgerMovement): number {
  const amount = Number(entry.amount ?? 0)
  if (!Number.isFinite(amount)) return 0
  return entry.type === "DEBIT" ? amount : -amount
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

/** openingBalance + Σ(DEBIT − CREDIT), rounded to paise. */
export function partyNetBalance(
  openingBalance: unknown,
  entries: Iterable<PartyLedgerMovement>,
): number {
  let net = Number(openingBalance ?? 0) || 0
  for (const entry of entries) net += partyLedgerDelta(entry)
  return round2(net)
}

export function partyBalanceDirection(net: number): PartyBalanceDirection {
  if (!Number.isFinite(net) || Math.abs(net) < SETTLED_EPSILON) return "Settled"
  return net > 0 ? "Receivable" : "Payable"
}

/** Totals across many parties: what's owed to the store, what it owes, net. */
export function partyBalanceTotals(nets: Iterable<number>) {
  let receivable = 0
  let payable = 0
  let receivableCount = 0
  let payableCount = 0
  for (const net of nets) {
    const direction = partyBalanceDirection(net)
    if (direction === "Receivable") {
      receivable += net
      receivableCount++
    } else if (direction === "Payable") {
      payable += -net
      payableCount++
    }
  }
  receivable = round2(receivable)
  payable = round2(payable)
  return { receivable, payable, net: round2(receivable - payable), receivableCount, payableCount }
}

/** "₹ 1,234.50" — always the absolute amount; the direction is a badge. */
export function formatPartyAmount(net: number, fractionDigits = 2) {
  return `₹ ${Math.abs(Number(net) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`
}

/** "₹ 1,234.50 Receivable" / "₹ 500.00 Payable" / "Settled" — for text
 *  surfaces (emails, exports, toasts) where a badge can't render. */
export function formatPartyBalanceText(net: number) {
  const direction = partyBalanceDirection(net)
  return direction === "Settled" ? "Settled" : `${formatPartyAmount(net)} ${direction}`
}

/**
 * Opening balance as entered on the party form / Excel import: a
 * non-negative amount plus Receivable/Payable. Stored signed.
 */
export type OpeningBalanceType = "RECEIVABLE" | "PAYABLE"

export function signedOpeningBalance(amount: number, type: OpeningBalanceType) {
  const abs = Math.abs(Number(amount) || 0)
  return type === "PAYABLE" ? -abs : abs
}

export function parseOpeningBalanceType(value: unknown): OpeningBalanceType | null {
  const text = String(value ?? "").trim().toLowerCase()
  if (!text) return null
  if (["receivable", "dr", "debit", "to receive", "they owe me", "receivable (they owe you)"].includes(text)) {
    return "RECEIVABLE"
  }
  if (["payable", "cr", "credit", "to pay", "i owe them", "payable (you owe them)"].includes(text)) {
    return "PAYABLE"
  }
  return null
}

export const OPENING_BALANCE_TYPE_LABELS: Record<OpeningBalanceType, string> = {
  RECEIVABLE: "Receivable",
  PAYABLE: "Payable",
}
