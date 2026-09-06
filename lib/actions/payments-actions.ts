"use server"

import { revalidatePath } from "next/cache"
import { LedgerEntryType, LedgerSourceType, PaymentMethod } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"
import { getLocationScope, locationWhere } from "@/lib/location-scope"
import { requirePermission } from "@/lib/auth/auth"
import { PERMISSIONS } from "@/lib/permissions"

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
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
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

/**
 * Record a standalone "Payment In" against a customer — not tied to any
 * specific invoice/Kacha slip (an on-account receipt). Same CREDIT/
 * PAYMENT_IN shape recordInvoicePayment writes, just without an invoiceId.
 */
export async function recordCustomerPayment(
  customerId: string,
  prevState: PaymentFormState = { success: false, message: "" },
  formData: FormData,
): Promise<PaymentFormState> {
  try {
    try {
      await requirePermission(PERMISSIONS.BILLING_UPDATE)
    } catch {
      return { success: false, message: "You do not have permission to record payments." }
    }

    if (!customerId) {
      return { success: false, message: "Select a customer" }
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
    if (!customer) return { success: false, message: "Customer not found" }

    await prisma.$transaction(
      payments.map((payment, index) =>
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
    )

    revalidatePath("/payments/in")
    revalidatePath("/ledger")
    revalidatePath(`/customers/${customerId}`)

    return { success: true, message: "Payment In recorded" }
  } catch (error) {
    console.error("recordCustomerPayment error:", error)
    return { success: false, message: "Failed to record payment" }
  }
}

/**
 * Record a standalone "Payment Out" against a vendor — not tied to any
 * specific purchase (an on-account payment). Same DEBIT/PAYMENT_OUT shape
 * recordPurchasePayment writes (paying a vendor reduces what the shop
 * owes them, opposite polarity from a customer receipt), just without a
 * purchaseId. For a Karigar party, the Payment Out dialog calls the
 * existing recordKarigarPayment action instead — it already supports
 * on-account payments and uses CREDIT there, matching that ledger's own
 * established convention.
 */
export async function recordVendorPayment(
  vendorId: string,
  prevState: PaymentFormState = { success: false, message: "" },
  formData: FormData,
): Promise<PaymentFormState> {
  try {
    try {
      await requirePermission(PERMISSIONS.PURCHASE_UPDATE)
    } catch {
      return { success: false, message: "You do not have permission to record purchase payments." }
    }

    if (!vendorId) {
      return { success: false, message: "Select a vendor" }
    }

    const paymentsRaw = String(formData.get("paymentsJson") || "[]")
    const notes = String(formData.get("notes") || "").trim() || null

    const payments = parsePayments(paymentsRaw)
    if (!payments) {
      return { success: false, message: "Add 1-2 valid payment methods with an amount" }
    }

    const storeId = await requireStoreScope()

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, storeId },
      select: { id: true, name: true },
    })
    if (!vendor) return { success: false, message: "Vendor not found" }

    await prisma.$transaction(
      payments.map((payment, index) =>
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
    )

    revalidatePath("/payments/out")
    revalidatePath("/ledger")
    revalidatePath(`/vendors/${vendorId}`)

    return { success: true, message: "Payment Out recorded" }
  } catch (error) {
    console.error("recordVendorPayment error:", error)
    return { success: false, message: "Failed to record payment" }
  }
}
