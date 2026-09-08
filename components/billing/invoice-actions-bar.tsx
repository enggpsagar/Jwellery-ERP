"use client"

import Link from "next/link"
import { Pencil, Printer } from "lucide-react"

import type { Invoice } from "@/lib/actions/invoice-actions"
import { getReturnEligibility } from "@/lib/return-window"
import { APP_NAME } from "@/lib/constants/app"
import { RecordPaymentDialog } from "@/components/billing/record-payment-dialog"
import { EmailInvoiceButton } from "@/components/billing/email-invoice-button"
import { ShareWhatsAppButton } from "@/components/billing/share-whatsapp-button"
import { CancelInvoiceDialog } from "@/components/billing/cancel-invoice-dialog"
import { ReturnItemsDialog } from "@/components/billing/return-items-dialog"
import { EditInvoiceDialog } from "@/components/billing/edit-invoice-dialog"
import { DeleteInvoiceDialog } from "@/components/billing/delete-invoice-dialog"
import { Button } from "@/components/ui/button"
import type { LocationOption } from "@/components/shared/location-select"

type InvoiceActionsBarProps = {
  invoice: Invoice
  businessName: string
  returnWindowEnabled: boolean
  returnWindowDays: number
  locations: LocationOption[]
}

/**
 * Every action available on an invoice — Print, WhatsApp, Email, the
 * metadata-only Edit/E-way Bill dialog, Edit Items (full line-item edit,
 * its own route), Cancel (plain and Cancel+Replace), Return Items, Record
 * Payment, Delete. Shared between the standalone /billing/[id] page and the
 * Billing list's inline detail panel so the two can never drift apart.
 *
 * Laid out as three fixed rows rather than one long wrapping flex line —
 * with 4-8 buttons live at once depending on status, a single row forced
 * odd mid-word wraps at narrower widths (the inline panel) and a
 * `ml-auto`-pushed icon cluster that could still land anywhere depending on
 * how the row broke. Row 1 is the set of decisions about the document
 * itself; row 2 the two "record something against it" actions; row 3 the
 * icon-only send/output/delete cluster, right-aligned in its own row so it
 * never competes for space with the labeled buttons above it.
 *
 * Each action's own visibility rule (see the status flags below) is
 * unchanged from what the standalone page always enforced — a fully PAID
 * invoice's total can't silently change without a real refund decision,
 * so it only ever gets the basic date/location/notes edit, never Cancel or
 * line-item editing.
 */
export function InvoiceActionsBar({
  invoice,
  businessName,
  returnWindowEnabled,
  returnWindowDays,
  locations,
}: InvoiceActionsBarProps) {
  const isCancelled = invoice.status === "CANCELLED"
  const isCancellable = invoice.status === "DRAFT" || invoice.status === "PARTIAL"
  const canFullyEdit = isCancellable

  const isReturnable =
    (invoice.status === "PAID" || invoice.status === "PARTIAL") &&
    returnWindowEnabled &&
    returnWindowDays > 0
  const returnEligibility = getReturnEligibility(new Date(invoice.invoiceDate), returnWindowDays)
  const canReturnItems = isReturnable && returnEligibility.eligible

  const whatsappMessage = `Hi! Here is your invoice ${invoice.invoiceNumber} from ${businessName}. Total: ₹${invoice.totalAmount.toFixed(2)}. Balance due: ₹${invoice.balanceAmount.toFixed(2)}.\n\nSent via ${APP_NAME}`

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
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
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {!isCancelled && (
          <>
            <RecordPaymentDialog invoiceId={invoice.id} balanceAmount={invoice.balanceAmount} />
            <EditInvoiceDialog
              compact
              invoiceId={invoice.id}
              invoiceDate={invoice.invoiceDate}
              dueDate={invoice.dueDate}
              notes={invoice.notes}
              locationId={invoice.locationId}
              locations={locations}
              ewayBillNumber={invoice.ewayBillNumber}
              ewayBillDate={invoice.ewayBillDate}
              transporterName={invoice.transporterName}
              vehicleNumber={invoice.vehicleNumber}
              transportMode={invoice.transportMode}
              distanceKm={invoice.distanceKm}
            />
          </>
        )}
        <ShareWhatsAppButton
          phone={invoice.customer?.phone}
          message={whatsappMessage}
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoiceNumber}
        />
        <EmailInvoiceButton invoiceId={invoice.id} />
        <Link
          href={`/billing/${invoice.id}/print`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[var(--chart-2)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)]"
          aria-label="Print invoice"
          title="Print"
        >
          <Printer className="h-4 w-4" />
        </Link>
        {invoice.status === "DRAFT" && (
          <DeleteInvoiceDialog compact invoiceId={invoice.id} invoiceNumber={invoice.invoiceNumber} />
        )}
      </div>
    </div>
  )
}
