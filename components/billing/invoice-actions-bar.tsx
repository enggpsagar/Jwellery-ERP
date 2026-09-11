"use client"

import Link from "next/link"
import { Pencil, Printer, Undo2 } from "lucide-react"

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

type InvoiceQuickActionsProps = {
  invoice: Invoice
  businessName: string
}

/**
 * The small icon-only "send/output" cluster — WhatsApp, Email, Print, and
 * Delete (DRAFT only) — that always sits top-right next to the invoice
 * title, regardless of how many labeled buttons InvoiceActionsBar below is
 * showing. Split out from InvoiceActionsBar specifically so its position
 * never depends on the labeled-button count: it renders in the title row
 * itself, not inside the wrapping button group.
 */
export function InvoiceQuickActions({ invoice, businessName }: InvoiceQuickActionsProps) {
  const whatsappMessage = `Hi! Here is your invoice ${invoice.invoiceNumber} from ${businessName}. Total: ₹${invoice.totalAmount.toFixed(2)}. Balance due: ₹${invoice.balanceAmount.toFixed(2)}.\n\nSent via ${APP_NAME}`

  return (
    <div className="flex shrink-0 items-center gap-2">
      <ShareWhatsAppButton
        phone={invoice.customer?.phone}
        message={whatsappMessage}
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoiceNumber}
      />
      <EmailInvoiceButton invoiceId={invoice.id} />
      <Link
        href={`/billing/${invoice.id}/print`}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent bg-primary/10 text-primary transition hover:bg-primary/20"
        aria-label="Print invoice"
        title="Print"
      >
        <Printer className="h-4 w-4" />
      </Link>
      {invoice.status === "DRAFT" && (
        <DeleteInvoiceDialog compact invoiceId={invoice.id} invoiceNumber={invoice.invoiceNumber} />
      )}
    </div>
  )
}

type InvoiceActionsBarProps = {
  invoice: Invoice
  returnWindowEnabled: boolean
  returnWindowDays: number
  locations: LocationOption[]
  /** Whether any line item still has something left to return — when the
   * invoice is otherwise return-eligible (status + window) but every item
   * has already been fully returned, the button reads "Returned" and is
   * disabled instead of opening a dialog that can only tell the user that. */
  hasReturnableItems: boolean
}

/**
 * The labeled decision/record-keeping buttons for an invoice — Edit Items,
 * Return & Exchange, Cancel Invoice, Return Items, Record Payment, E-way
 * Bill. Left-aligned and left to wrap onto as many lines as the available
 * width needs, since the live set varies a lot by status (a PAID invoice
 * might show only Return Items + E-way Bill; a DRAFT one shows five). The
 * icon-only send/output cluster is deliberately NOT in here — see
 * InvoiceQuickActions, rendered in the title row instead so its position
 * never shifts with this group's count.
 *
 * Shared between the standalone /billing/[id] page and the Billing list's
 * inline detail panel so the two can never drift apart. Each action's own
 * visibility rule is unchanged from what the standalone page always
 * enforced — a fully PAID invoice's total can't silently change without a
 * real refund decision, so it only ever gets the basic date/location/notes
 * edit, never Cancel or line-item editing.
 */
export function InvoiceActionsBar({
  invoice,
  returnWindowEnabled,
  returnWindowDays,
  locations,
  hasReturnableItems,
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

  if (isCancelled && !canReturnItems) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canFullyEdit && (
        <Button
          asChild
          variant="outline"
          className="gap-2 border-transparent bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
        >
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
        hasReturnableItems ? (
          <ReturnItemsDialog invoiceId={invoice.id} invoiceNumber={invoice.invoiceNumber} />
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            disabled
            title="Every item on this invoice has already been returned"
          >
            <Undo2 className="h-4 w-4" />
            Returned
          </Button>
        )
      )}
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
    </div>
  )
}
