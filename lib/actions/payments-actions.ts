"use server"

import { revalidatePath } from "next/cache"
import { LedgerEntryType, LedgerSourceType, PaymentMethod, InvoiceStatus, Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"
import { actionErrorMessage } from "@/lib/action-error";
import { getLocationScope, locationWhere } from "@/lib/location-scope"
import { requirePermission } from "@/lib/auth/auth"
import { PERMISSIONS } from "@/lib/permissions"
import { formatShortDate } from "@/lib/utils"
import { logger } from "@/lib/logger";

export type PaymentFormState = {
  success: boolean
  message: string
  errors?: Record<string, string[]>
}

type PaymentEntryInput = {
  method: string
  amount: number
  reference?: string | null
  bankName?: string | null
  attachmentUrl?: string | null
}

type OutstandingDoc = {
  date: Date
  paidAmount: number
  balanceAmount: number
  totalAmount: number
  buildUpdate: (data: {
    paidAmount: number
    balanceAmount: number
    status: InvoiceStatus
  }) => Prisma.PrismaPromise<unknown>
}

/**
 * A general "Payment In"/"Payment Out" here isn't tied to one specific
 * invoice/purchase (see recordCustomerPayment/recordPaymentOut's own doc
 * comments) — but leaving every outstanding document's balanceAmount
 * untouched meant the money never actually reduced what the app considers
 * "owed," so Outstanding Receivables (getDashboardStats, which sums
 * Invoice/KachaInvoice balanceAmount directly) and every Customer/Vendor
 * pendingAmount display stayed wrong even after a real payment. This
 * applies the amount oldest-document-first — the standard reconciliation
 * rule real accounting software uses for an unallocated on-account payment
 * — same paidAmount/balanceAmount/status update recordInvoicePayment and
 * recordPurchasePayment already do per-document, just spread across
 * however many oldest documents the amount reaches. Any amount left over
 * once every outstanding document is fully paid (an overpayment / advance)
 * is deliberately left unapplied — it still shows up as the ledger entry
 * this function's caller creates, same as before this fix.
 */
function allocatePaymentOldestFirst(
  amount: number,
  docs: OutstandingDoc[],
): Prisma.PrismaPromise<unknown>[] {
  const updates: Prisma.PrismaPromise<unknown>[] = []
  let remaining = amount

  for (const doc of [...docs].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    if (remaining <= 0) break
    const applied = Math.min(remaining, doc.balanceAmount)
    if (applied <= 0) continue

    const newPaid = doc.paidAmount + applied
    const newBalance = Math.max(0, doc.totalAmount - newPaid)
    const status = newBalance === 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL

    updates.push(doc.buildUpdate({ paidAmount: newPaid, balanceAmount: newBalance, status }))
    remaining -= applied
  }

  return updates
}

/** Same shape/validation as every other "Record Payment" action in this
 * app (invoice/purchase/karigar) — kept as its own small copy rather than a
 * shared import, matching how each action file already carries its own
 * parsePayments rather than a cross-file dependency. */
function parsePayments(raw: string): PaymentEntryInput[] | null {
  let payments: PaymentEntryInput[]
  try {
    payments = JSON.parse(raw)
  } catch {
    return null
  }

  if (!Array.isArray(payments) || payments.length < 1 || payments.length > 2) {
    return null
  }

  for (const payment of payments) {
    if (!Object.values(PaymentMethod).includes(payment.method as PaymentMethod)) {
      return null
    }
    if (!(Number(payment.amount) > 0)) {
      return null
    }
  }

  return payments
}

function formatDate(date: Date) {
  return formatShortDate(date)
}

export type PaymentInRow = {
  id: string
  dateISO: string
  date: string
  customerId: string | null
  customerName: string
  amount: number
  paymentMethod: string | null
  paymentReference: string | null
  bankName: string | null
  attachmentUrl: string | null
  invoiceId: string | null
  invoiceNumber: string | null
  description: string
}

/**
 * Every "Payment In" ever recorded — whether from the centralized Payment In
 * page (no invoice, an on-account receipt) or from an invoice/Kacha slip's
 * own "Record Payment" dialog. Both write the same PAYMENT_IN sourceType, so
 * this one query surfaces the complete picture with a plain filter, no
 * heuristics needed.
 */
export async function getPaymentsIn(): Promise<PaymentInRow[]> {
  const storeId = await requireStoreScope()
  const scope = await getLocationScope()

  const entries = await prisma.ledgerEntry.findMany({
    where: { storeId, sourceType: LedgerSourceType.PAYMENT_IN, ...locationWhere(scope) },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    include: {
      customer: { select: { id: true, name: true } },
      invoice: { select: { id: true, invoiceNumber: true } },
    },
  })

  return entries.map((entry) => ({
    id: entry.id,
    dateISO: entry.entryDate.toISOString(),
    date: formatDate(entry.entryDate),
    customerId: entry.customerId,
    customerName: entry.customer?.name ?? "-",
    amount: Number(entry.amount),
    paymentMethod: entry.paymentMethod,
    paymentReference: entry.paymentReference,
    bankName: entry.bankName,
    attachmentUrl: entry.attachmentUrl,
    invoiceId: entry.invoiceId,
    invoiceNumber: entry.invoice?.invoiceNumber ?? null,
    description: entry.description ?? "",
  }))
}

export type PaymentOutRow = {
  id: string
  dateISO: string
  date: string
  partyType: "VENDOR" | "KARIGAR"
  partyId: string
  partyName: string
  amount: number
  paymentMethod: string | null
  paymentReference: string | null
  bankName: string | null
  attachmentUrl: string | null
  purchaseId: string | null
  purchaseNumber: string | null
  description: string
}

/**
 * Every "Payment Out" ever recorded, to either a Vendor or a Karigar —
 * whether from the centralized Payment Out page, a purchase's own "Record
 * Payment" dialog, or a karigar's own "Payment Out" action. All four write
 * the same PAYMENT_OUT sourceType.
 */
export async function getPaymentsOut(): Promise<PaymentOutRow[]> {
  const storeId = await requireStoreScope()
  const scope = await getLocationScope()

  const entries = await prisma.ledgerEntry.findMany({
    where: { storeId, sourceType: LedgerSourceType.PAYMENT_OUT, ...locationWhere(scope) },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    include: {
      vendor: { select: { id: true, name: true } },
      karigar: { select: { id: true, name: true } },
      purchase: { select: { id: true, purchaseNumber: true } },
    },
  })

  return entries
    .filter((entry) => entry.vendorId || entry.karigarId)
    .map((entry) => ({
      id: entry.id,
      dateISO: entry.entryDate.toISOString(),
      date: formatDate(entry.entryDate),
      partyType: entry.vendorId ? ("VENDOR" as const) : ("KARIGAR" as const),
      partyId: (entry.vendorId ?? entry.karigarId)!,
      partyName: entry.vendor?.name ?? entry.karigar?.name ?? "-",
      amount: Number(entry.amount),
      paymentMethod: entry.paymentMethod,
      paymentReference: entry.paymentReference,
      bankName: entry.bankName,
      attachmentUrl: entry.attachmentUrl,
      purchaseId: entry.purchaseId,
      purchaseNumber: entry.purchase?.purchaseNumber ?? null,
      description: entry.description ?? "",
    }))
}

export type PaymentKarigarOption = {
  id: string
  name: string
  mobile: string | null
  code: string | null
}

/** Lightweight, unpaginated karigar list for the Payment Out party picker —
 * mirrors getInvoiceFormCustomers/getPurchaseFormVendors' own shape. */
export async function getPaymentFormKarigars(): Promise<PaymentKarigarOption[]> {
  const storeId = await requireStoreScope()

  return prisma.karigar.findMany({
    where: { storeId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, mobile: true, code: true },
  })
}

export type PaymentVendorOption = {
  id: string
  name: string
  phone: string | null
  vendorCode: string | null
  /** Sum of every unpaid/partial purchase's own balanceAmount — used only
   * to decide which purchases a specific payment applies against
   * (allocatePaymentOldestFirst), NOT for display — see currentBalance for
   * that (this can be ₹0 for a vendor with real money outstanding purely
   * on the ledger, e.g. a linked-party advance with no open purchase to
   * apply it to). */
  pendingAmount: number
  /** The real, ledger-derived outstanding shown to whoever is paying —
   * same figure and same linked-Customer blend as vendor-actions.ts'
   * mapVendor, so this picker can never disagree with the Vendors list for
   * the exact same vendor (it used to, back when this showed pendingAmount
   * instead: a vendor whose every purchase was settled but who also held a
   * standalone advance via a linked Customer showed a flatly wrong ₹0). */
  currentBalance: number
  balanceType: "Advance" | "Payable"
}

/** Vendor list for the Payment Out party picker, carrying each vendor's
 * outstanding balance alongside the usual name/phone. */
export async function getPaymentFormVendorsWithBalance(): Promise<PaymentVendorOption[]> {
  const storeId = await requireStoreScope()

  const vendors = await prisma.vendor.findMany({
    where: { storeId, isActive: true, isArchived: false },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      vendorCode: true,
      openingBalance: true,
      purchases: { select: { balanceAmount: true, status: true } },
      ledgerEntries: { select: { amount: true, type: true } },
      linkedCustomer: {
        select: {
          openingBalance: true,
          ledgerEntries: { select: { amount: true, type: true } },
        },
      },
    },
  })

  return vendors.map((vendor) => {
    // Same fix as mapVendor's own pendingAmount (vendor-actions.ts) — this
    // used to ignore openingBalance and any CANCELLED purchase entirely.
    const pendingAmount =
      vendor.purchases.reduce(
        (sum, p) => (p.status === "CANCELLED" ? sum : sum + Number(p.balanceAmount || 0)),
        0,
      ) + Number(vendor.openingBalance ?? 0)

    // Identical formula to mapVendor's combinedBalance — see that
    // function's own comment for why the linked Customer's balance factors
    // in here too.
    const ownBalance =
      Number(vendor.openingBalance ?? 0) +
      vendor.ledgerEntries.reduce(
        (sum, e) => sum + (e.type === "CREDIT" ? Number(e.amount ?? 0) : -Number(e.amount ?? 0)),
        0,
      )
    const linkedCustomerBalance = vendor.linkedCustomer
      ? Number(vendor.linkedCustomer.openingBalance ?? 0) +
        vendor.linkedCustomer.ledgerEntries.reduce(
          (sum, e) => sum + (e.type === "DEBIT" ? Number(e.amount ?? 0) : -Number(e.amount ?? 0)),
          0,
        )
      : 0
    const currentBalance = ownBalance - linkedCustomerBalance

    return {
      id: vendor.id,
      name: vendor.name,
      phone: vendor.phone,
      vendorCode: vendor.vendorCode,
      pendingAmount,
      currentBalance,
      balanceType: currentBalance < 0 ? "Advance" : "Payable",
    }
  })
}

export type PaymentCustomerOption = {
  id: string
  name: string
  phone: string | null
  customerCode: string | null
  /** Sum of every unpaid/partial invoice's own balanceAmount — used only
   * for FIFO allocation, not display. See PaymentVendorOption.pendingAmount
   * for why, mirrored for the customer side. */
  pendingAmount: number
  /** The real, ledger-derived outstanding shown to whoever is recording the
   * payment — same figure and linked-Vendor blend as lib/core/customer.ts'
   * mapCustomer. See PaymentVendorOption.currentBalance's own comment. */
  currentBalance: number
  balanceType: "Advance" | "Receivable"
}

/** Customer list for the Payment In party picker, carrying each customer's
 * outstanding balance alongside the usual name/phone. */
export async function getPaymentFormCustomersWithBalance(): Promise<PaymentCustomerOption[]> {
  const storeId = await requireStoreScope()

  const customers = await prisma.customer.findMany({
    where: { storeId, isActive: true, isArchived: false },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      customerCode: true,
      openingBalance: true,
      invoices: { select: { balanceAmount: true, status: true } },
      kachaInvoices: { select: { balanceAmount: true, status: true } },
      ledgerEntries: { select: { amount: true, type: true } },
      linkedVendor: {
        select: {
          openingBalance: true,
          ledgerEntries: { select: { amount: true, type: true } },
        },
      },
    },
  })

  return customers.map((customer) => {
    // Same fix as mapCustomer's own pendingAmount (lib/core/customer.ts) —
    // this used to ignore Kacha slips, any CANCELLED invoice, and
    // openingBalance entirely.
    const pendingAmount =
      customer.invoices.reduce(
        (sum, i) => (i.status === "CANCELLED" ? sum : sum + Number(i.balanceAmount || 0)),
        0,
      ) +
      customer.kachaInvoices.reduce(
        (sum, k) => (k.status === "CANCELLED" ? sum : sum + Number(k.balanceAmount || 0)),
        0,
      ) +
      Number(customer.openingBalance ?? 0)

    // Identical formula to mapCustomer's combinedBalance — see that
    // function's own comment for why the linked Vendor's balance factors
    // in here too.
    const ownBalance =
      Number(customer.openingBalance ?? 0) +
      customer.ledgerEntries.reduce(
        (sum, e) => sum + (e.type === "DEBIT" ? Number(e.amount ?? 0) : -Number(e.amount ?? 0)),
        0,
      )
    const linkedVendorBalance = customer.linkedVendor
      ? Number(customer.linkedVendor.openingBalance ?? 0) +
        customer.linkedVendor.ledgerEntries.reduce(
          (sum, e) => sum + (e.type === "CREDIT" ? Number(e.amount ?? 0) : -Number(e.amount ?? 0)),
          0,
        )
      : 0
    const currentBalance = ownBalance - linkedVendorBalance

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      customerCode: customer.customerCode,
      pendingAmount,
      currentBalance,
      balanceType: currentBalance < 0 ? "Advance" : "Receivable",
    }
  })
}

/**
 * Record a standalone "Payment In" against a customer — not tied to any
 * specific invoice/Kacha slip (an on-account receipt). Same CREDIT/
 * PAYMENT_IN shape recordInvoicePayment writes, just without an invoiceId.
 * Unbound (reads customerId from the CustomerSelect's own hidden field)
 * rather than a bound first argument, since which customer this is against
 * is chosen inside the dialog itself, not fixed ahead of time the way a
 * per-record "Record Payment" dialog already knows its invoiceId/karigarId.
 */
export async function recordCustomerPayment(
  prevState: PaymentFormState = { success: false, message: "" },
  formData: FormData,
): Promise<PaymentFormState> {
  try {
    try {
      await requirePermission(PERMISSIONS.BILLING_UPDATE)
    } catch {
      return { success: false, message: "You do not have permission to record payments." }
    }

    const customerId = String(formData.get("customerId") || "").trim()
    if (!customerId) {
      return { success: false, message: "Select a party" }
    }

    const paymentsRaw = String(formData.get("paymentsJson") || "[]")
    const notes = String(formData.get("notes") || "").trim() || null

    const payments = parsePayments(paymentsRaw)
    if (!payments) {
      return { success: false, message: "Add 1-2 valid payment methods with an amount" }
    }

    const storeId = await requireStoreScope()

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: { id: true, name: true },
    })
    if (!customer) return { success: false, message: "Party not found" }

    const totalAmount = payments.reduce((sum, payment) => sum + Number(payment.amount), 0)

    // Same "outstanding" definition getDashboardStats' Outstanding
    // Receivables card uses — an unallocated payment settling this
    // customer's oldest bills first is what actually makes that figure (and
    // every Customer pendingAmount display) move.
    const [outstandingInvoices, outstandingKacha] = await Promise.all([
      prisma.invoice.findMany({
        where: { storeId, customerId, balanceAmount: { gt: 0 }, status: { not: InvoiceStatus.CANCELLED } },
        select: { id: true, invoiceDate: true, paidAmount: true, balanceAmount: true, totalAmount: true },
      }),
      prisma.kachaInvoice.findMany({
        where: { storeId, customerId, balanceAmount: { gt: 0 } },
        select: { id: true, invoiceDate: true, paidAmount: true, balanceAmount: true, totalAmount: true },
      }),
    ])

    const outstandingDocs = [
      ...outstandingInvoices.map((invoice) => ({
        date: invoice.invoiceDate,
        paidAmount: Number(invoice.paidAmount),
        balanceAmount: Number(invoice.balanceAmount),
        totalAmount: Number(invoice.totalAmount),
        buildUpdate: (data: { paidAmount: number; balanceAmount: number; status: InvoiceStatus }) =>
          prisma.invoice.update({ where: { id: invoice.id }, data }),
      })),
      ...outstandingKacha.map((kacha) => ({
        date: kacha.invoiceDate,
        paidAmount: Number(kacha.paidAmount),
        balanceAmount: Number(kacha.balanceAmount),
        totalAmount: Number(kacha.totalAmount),
        buildUpdate: (data: { paidAmount: number; balanceAmount: number; status: InvoiceStatus }) =>
          prisma.kachaInvoice.update({ where: { id: kacha.id }, data }),
      })),
    ]

    const balanceUpdates = allocatePaymentOldestFirst(totalAmount, outstandingDocs)

    await prisma.$transaction([
      ...balanceUpdates,
      ...payments.map((payment, index) =>
        prisma.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.PAYMENT_IN,
            customerId,
            amount: payment.amount,
            paymentMethod: payment.method as PaymentMethod,
            paymentReference: payment.reference ?? undefined,
            bankName: payment.bankName ?? undefined,
            attachmentUrl: payment.attachmentUrl ?? undefined,
            description: notes ?? (index === 0 ? `Payment received from ${customer.name}` : undefined),
          },
        }),
      ),
    ])

    revalidatePath("/payments/in")
    revalidatePath("/ledger")
    revalidatePath(`/customers/${customerId}`)
    revalidatePath("/dashboard")
    revalidatePath("/billing")
    revalidatePath("/billing/kacha")

    return { success: true, message: "Payment In recorded" }
  } catch (error) {
    logger.error("recordCustomerPayment error", error)
    return { success: false, message: actionErrorMessage(error, "Failed to record payment") }
  }
}

/**
 * Record a standalone "Payment Out" against either a Vendor or a Karigar —
 * not tied to any specific purchase/job (an on-account payment). One action
 * for both party types (the dialog's own party-type toggle picks which),
 * since useActionState needs one stable action reference and which party
 * type this is isn't known until submit time.
 *
 * A Vendor payment is DEBIT — recordPurchasePayment's own established
 * convention (paying down what the shop owes reduces that payable, the
 * opposite polarity from a customer receipt). A Karigar payment is CREDIT
 * — recordKarigarPayment's own established convention. These two ledgers
 * genuinely use opposite polarity for "money paid out" today; this keeps
 * both consistent with their own existing history rather than unifying
 * them into one (which would silently invert every past Vendor or Karigar
 * entry's meaning).
 */
export async function recordPaymentOut(
  prevState: PaymentFormState = { success: false, message: "" },
  formData: FormData,
): Promise<PaymentFormState> {
  try {
    const partyType = String(formData.get("partyType") || "")
    if (partyType !== "VENDOR" && partyType !== "KARIGAR") {
      return { success: false, message: "Select who this payment is for" }
    }

    try {
      await requirePermission(
        partyType === "VENDOR" ? PERMISSIONS.PURCHASE_UPDATE : PERMISSIONS.KARIGAR_UPDATE,
      )
    } catch {
      return { success: false, message: "You do not have permission to record this payment." }
    }

    const paymentsRaw = String(formData.get("paymentsJson") || "[]")
    const notes = String(formData.get("notes") || "").trim() || null

    const payments = parsePayments(paymentsRaw)
    if (!payments) {
      return { success: false, message: "Add 1-2 valid payment methods with an amount" }
    }

    const storeId = await requireStoreScope()

    if (partyType === "VENDOR") {
      const vendorId = String(formData.get("vendorId") || "").trim()
      if (!vendorId) return { success: false, message: "Select a vendor" }

      const vendor = await prisma.vendor.findFirst({
        where: { id: vendorId, storeId },
        select: { id: true, name: true },
      })
      if (!vendor) return { success: false, message: "Vendor not found" }

      const totalAmount = payments.reduce((sum, payment) => sum + Number(payment.amount), 0)

      // Same fix as recordCustomerPayment's own — an unallocated Payment Out
      // must still pay down this vendor's oldest outstanding purchases, or
      // their balance never reflects it.
      const outstandingPurchases = await prisma.purchase.findMany({
        where: { storeId, vendorId, balanceAmount: { gt: 0 }, status: { not: InvoiceStatus.CANCELLED } },
        select: { id: true, purchaseDate: true, paidAmount: true, balanceAmount: true, totalAmount: true },
      })

      const balanceUpdates = allocatePaymentOldestFirst(
        totalAmount,
        outstandingPurchases.map((purchase) => ({
          date: purchase.purchaseDate,
          paidAmount: Number(purchase.paidAmount),
          balanceAmount: Number(purchase.balanceAmount),
          totalAmount: Number(purchase.totalAmount),
          buildUpdate: (data: { paidAmount: number; balanceAmount: number; status: InvoiceStatus }) =>
            prisma.purchase.update({ where: { id: purchase.id }, data }),
        })),
      )

      await prisma.$transaction([
        ...balanceUpdates,
        ...payments.map((payment, index) =>
          prisma.ledgerEntry.create({
            data: {
              storeId,
              type: LedgerEntryType.DEBIT,
              sourceType: LedgerSourceType.PAYMENT_OUT,
              vendorId,
              amount: payment.amount,
              paymentMethod: payment.method as PaymentMethod,
              paymentReference: payment.reference ?? undefined,
              bankName: payment.bankName ?? undefined,
              attachmentUrl: payment.attachmentUrl ?? undefined,
              description: notes ?? (index === 0 ? `Payment made to ${vendor.name}` : undefined),
            },
          }),
        ),
      ])

      revalidatePath("/payments/out")
      revalidatePath("/ledger")
      revalidatePath(`/vendors/${vendorId}`)
      revalidatePath("/dashboard")
      revalidatePath("/purchases")

      return { success: true, message: "Payment Out recorded" }
    }

    const karigarId = String(formData.get("karigarId") || "").trim()
    if (!karigarId) return { success: false, message: "Select an artisan" }

    const karigar = await prisma.karigar.findFirst({
      where: { id: karigarId, storeId },
      select: { id: true, name: true, locationId: true },
    })
    if (!karigar) return { success: false, message: "Artisan not found" }

    await prisma.$transaction(
      payments.map((payment, index) =>
        prisma.ledgerEntry.create({
          data: {
            storeId,
            type: LedgerEntryType.CREDIT,
            sourceType: LedgerSourceType.PAYMENT_OUT,
            karigarId,
            amount: payment.amount,
            paymentMethod: payment.method as PaymentMethod,
            paymentReference: payment.reference ?? undefined,
            bankName: payment.bankName ?? undefined,
            attachmentUrl: payment.attachmentUrl ?? undefined,
            locationId: karigar.locationId ?? undefined,
            description: notes ?? (index === 0 ? `Payment made to ${karigar.name}` : undefined),
          },
        }),
      ),
    )

    revalidatePath("/payments/out")
    revalidatePath("/ledger")
    revalidatePath(`/karigars/${karigarId}`)

    return { success: true, message: "Payment Out recorded" }
  } catch (error) {
    logger.error("recordPaymentOut error", error)
    return { success: false, message: actionErrorMessage(error, "Failed to record payment") }
  }
}
