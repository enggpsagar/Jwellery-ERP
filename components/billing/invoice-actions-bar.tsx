"use client"

import Link from "next/link"
import { Pencil, Printer } from "lucide-react"

import type { Invoice } from "@/lib/actions/invoice-actions"
import { getReturnEligibility } from "@/lib/return-window"
import { APP_NAME } from "@/lib/constants/app"
import { RecordPaymentDialog } from "@/components/billing/record-payment-dialog"
import { EmailInvoiceButton } from "@/components/billing/email-invoice-button"
import { ShareWhatsAppButton } from "@/components/billing/share-whatsapp-button"
import { EditInvoiceDialog } from "@/components/billing/edit-invoice-dialog"
import { CancelInvoiceDialog } from "@/components/billing/cancel-invoice-dialog"
import { ReturnItemsDialog } from "@/components/billing/return-items-dialog"
import { Button } from "@/components/ui/button"
import type { LocationOption } from "@/components/shared/location-select"

type InvoiceActionsBarProps = {
  invoice: Invoice
  locations: LocationOption[]
  businessName: string
  returnWindowDays: number
}

/**
 * Every action available on an invoice — Print, WhatsApp, Email, the
 * metadata-only Edit dialog, Edit Items (full line-item edit, its own
 * route), Cancel (plain and Cancel+Replace), Return Items, Record Payment.
 * Shared between the standalone /billing/[id] page and the Billing list's
 * inline detail panel so the two can never drift apart — same convention
 * as PurchaseRowActions, just with far more going on since Invoice already
 * had all of this before either page existed.
 *
 * Each action's own visibility rule (see the status flags below) is
 * unchanged from what the standalone page always enforced — a fully PAID
 * invoice's total can't silently change without a real refund decision,
 * so it only ever gets the basic date/location/notes edit, never Cancel or
 * line-item editing.
 */
export function InvoiceActionsBar({
  invoice,
  locations,
  businessName,
  returnWindowDays,
}: InvoiceActionsBarProps) {
  const isCancelled = invoice.status === "CANCELLED"
  const isCancellable = invoice.status === "DRAFT" || invoice.status === "PARTIAL"
  const canFullyEdit = isCancellable

  const isReturnable =
    (invoice.status === "PAID" || invoice.status === "PARTIAL") && returnWindowDays > 0
  const returnEligibility = getReturnEligibility(new Date(invoice.invoiceDate), returnWindowDays)
  const canReturnItems = isReturnable && returnEligibility.eligible

  const whatsappMessage = `Hi! Here is your invoice ${invoice.invoiceNumber} from ${businessName}. Total: ₹${invoice.totalAmount.toFixed(2)}. Balance due: ₹${invoice.balanceAmount.toFixed(2)}.\n\nSent via ${APP_NAME}`

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ShareWhatsAppButton
        phone={invoice.customer?.phone}
        message={whatsappMessage}
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoiceNumber}
      />
      <EmailInvoiceButton invoiceId={invoice.id} />
      {!isCancelled && (
        <EditInvoiceDialog
          invoiceId={invoice.id}
          invoiceDate={invoice.invoiceDate}
          dueDate={invoice.dueDate}
          notes={invoice.notes}
          locationId={invoice.locationId ?? null}
          locations={locations}
          ewayBillNumber={invoice.ewayBillNumber}
          ewayBillDate={invoice.ewayBillDate}
          transporterName={invoice.transporterName}
          vehicleNumber={invoice.vehicleNumber}
          transportMode={invoice.transportMode}
          distanceKm={invoice.distanceKm}
        />
      )}
      {canFullyEdit && (
        <Button asChild variant="outline" className="gap-2">
          <Link href={`/billing/${invoice.id}/edit`}>
            <Pencil className="h-4 w-4" />
            Edit Items
          </Link>
        </Button>
      )}
      {isCancellable && (
        <>
          <CancelInvoiceDialog
            invoiceId={invoice.id}
            invoiceNumber={invoice.invoiceNumber}
            balanceAmount={invoice.balanceAmount}
            mode="returnExchange"
          />
          <CancelInvoiceDialog
            invoiceId={invoice.id}
            invoiceNumber={invoice.invoiceNumber}
            balanceAmount={invoice.balanceAmount}
          />
        </>
      )}
      {canReturnItems && (
        <ReturnItemsDialog invoiceId={invoice.id} invoiceNumber={invoice.invoiceNumber} />
      )}
      {!isCancelled && (
        <RecordPaymentDialog invoiceId={invoice.id} balanceAmount={invoice.balanceAmount} />
      )}

      {/* Rightmost, icon-only — every other action here needs a decision
          or opens a dialog; Print is the one plain "go do the physical
          thing" action, so it doesn't compete for the same visual weight. */}
      <Link
        href={`/billing/${invoice.id}/print`}
        className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md bg-[var(--chart-2)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)]"
        aria-label="Print invoice"
        title="Print"
      >
        <Printer className="h-4 w-4" />
      </Link>
    </div>
  )
}
