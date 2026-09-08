import Link from "next/link"
import { ArrowLeftCircle, ArrowRightCircle, Plus, Receipt } from "lucide-react"

import type { Invoice } from "@/lib/actions/invoice-actions"
import type { CreditNoteView } from "@/lib/actions/credit-note-actions"
import { getReturnEligibility } from "@/lib/return-window"
import { toTitleCase, formatShortDate } from "@/lib/utils"
import { InvoiceStatusBadge } from "@/components/billing/invoice-status-badge"
import { InvoiceQrCard } from "@/components/billing/invoice-qr-card"
import { InvoiceItemsTable } from "@/components/billing/invoice-items-table"
import { InvoiceDueDatePrompt } from "@/components/billing/invoice-due-date-prompt"
import { Button } from "@/components/ui/button"

const TRANSPORT_MODE_LABELS: Record<string, string> = {
  ROAD: "Road",
  RAIL: "Rail",
  AIR: "Air",
  SHIP: "Ship",
}

type InvoiceDetailContentProps = {
  invoice: Invoice
  creditNotes: CreditNoteView[]
  returnWindowEnabled: boolean
  returnWindowDays: number
}

/**
 * The body of an invoice's detail view — status/customer summary, the
 * cancelled banner, credit notes raised against it, line items, totals,
 * E-way Bill, notes. Shared between the standalone /billing/[id] page and
 * the Billing list's inline detail panel, same convention as
 * CustomerDetailContent/PurchaseDetailContent — and shares its status-flag
 * derivation with InvoiceActionsBar so the two can never disagree about
 * what a given invoice's status allows.
 */
export function InvoiceDetailContent({ invoice, creditNotes, returnWindowEnabled, returnWindowDays }: InvoiceDetailContentProps) {
  const isCancelled = invoice.status === "CANCELLED"
  const isCancellable = invoice.status === "DRAFT" || invoice.status === "PARTIAL"
  const canFullyEdit = isCancellable

  const isReturnable =
    (invoice.status === "PAID" || invoice.status === "PARTIAL") &&
    returnWindowEnabled &&
    returnWindowDays > 0
  const returnEligibility = getReturnEligibility(new Date(invoice.invoiceDate), returnWindowDays)

  return (
    <div className="space-y-6">
      {!isCancelled && invoice.balanceAmount > 0 && !invoice.dueDate && (
        <InvoiceDueDatePrompt invoiceId={invoice.id} balanceAmount={invoice.balanceAmount} />
      )}

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <div className="flex flex-wrap items-center gap-2">
              <InvoiceStatusBadge status={invoice.status} />
              {invoice.convertedFromKacha && (
                <Link
                  href={`/billing/kacha/${invoice.convertedFromKacha.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                >
                  <ArrowLeftCircle className="h-3.5 w-3.5" />
                  Converted from Estimate ({invoice.convertedFromKacha.slipNumber})
                </Link>
              )}
              {invoice.replaces && (
                <Link
                  href={`/billing/${invoice.replaces.id}?from=${encodeURIComponent(`/billing/${invoice.id}`)}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                >
                  <ArrowLeftCircle className="h-3.5 w-3.5" />
                  Replaces {invoice.replaces.invoiceNumber}
                </Link>
              )}
              {invoice.replacedBy && (
                <Link
                  href={`/billing/${invoice.replacedBy.id}?from=${encodeURIComponent(`/billing/${invoice.id}`)}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                >
                  Replaced by {invoice.replacedBy.invoiceNumber}
                  <ArrowRightCircle className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>

          {invoice.dueDate && (
            <div>
              <p className="text-sm text-muted-foreground">Due Date</p>
              <p className="font-medium">{formatShortDate(invoice.dueDate)}</p>
            </div>
          )}

          {isReturnable && (
            <div>
              <p className="text-sm text-muted-foreground">Return Window</p>
              {returnEligibility.eligible ? (
                <p className="font-medium text-green-700">
                  Eligible until {formatShortDate(returnEligibility.windowExpiresAt)}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {returnEligibility.daysRemaining} day{returnEligibility.daysRemaining === 1 ? "" : "s"} left
                  </span>
                </p>
              ) : (
                <p className="font-medium text-red-600">
                  Expired {formatShortDate(returnEligibility.windowExpiresAt)}
                </p>
              )}
            </div>
          )}

          {/* Always shown, including when it is not known: an invoice with
              no answer is different from one nobody has looked at, and the
              blank would otherwise read as a missing field. */}
          <div>
            <p className="text-sm text-muted-foreground">Billed by</p>
            <p className="font-medium">
              {invoice.createdByName ?? <span className="text-muted-foreground">Not recorded</span>}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Party</p>
            {invoice.customer ? (
              <Link
                href={`/customers/${invoice.customer.id}?from=${encodeURIComponent(`/billing/${invoice.id}`)}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {toTitleCase(invoice.customer.name)}
                {invoice.customer.phone ? ` (${invoice.customer.phone})` : ""}
              </Link>
            ) : (
              // An invoice always has a customer in practice, but the mapped
              // shape allows null — render plain text rather than a link to
              // /customers/undefined.
              <p className="font-medium">—</p>
            )}
          </div>

          <div>
            <p className="text-sm text-muted-foreground">QR Code</p>
            <InvoiceQrCard dataUrl={invoice.qrDataUrl} invoiceNumber={invoice.invoiceNumber} />
          </div>
        </div>
      </div>

      {isCancelled && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 space-y-3">
          <div>
            <p className="font-medium text-red-700">This invoice was cancelled</p>
            <p className="text-sm text-red-700/80">
              {invoice.cancelledAt && new Date(invoice.cancelledAt).toLocaleString("en-IN")}
              {invoice.cancelledByName ? ` · by ${invoice.cancelledByName}` : ""}
            </p>
            {invoice.cancellationReason && (
              <p className="mt-1 text-sm text-red-700/80">Reason: {invoice.cancellationReason}</p>
            )}
          </div>
          {!invoice.replacedBy && (
            <Button asChild size="sm" className="gap-2">
              <Link href={`/billing/${invoice.id}/replace`}>
                <Plus className="h-4 w-4" />
                Create Replacement Invoice
              </Link>
            </Button>
          )}
        </div>
      )}

      {creditNotes.length > 0 && (
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <p className="font-medium">Credit Notes against this invoice</p>
          <div className="space-y-2">
            {creditNotes.map((creditNote) => (
              <Link
                key={creditNote.id}
                href={`/billing/credit-notes/${creditNote.id}`}
                className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-accent"
              >
                <span className="inline-flex items-center gap-2 font-medium">
                  <Receipt className="h-4 w-4" />
                  {creditNote.creditNoteNumber}
                  <span className="text-xs font-normal text-muted-foreground">
                    {formatShortDate(creditNote.creditNoteDate)}
                  </span>
                </span>
                <span className="font-medium text-red-600">-₹{creditNote.totalAmount.toFixed(2)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <InvoiceItemsTable invoiceId={invoice.id} items={invoice.items} canEdit={canFullyEdit} />

      <div className="ml-auto max-w-sm space-y-1 rounded-xl border bg-card p-6 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>₹{invoice.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Discount</span>
          <span>-₹{invoice.discount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span>₹{invoice.taxAmount.toFixed(2)}</span>
        </div>
        {invoice.roundOffAmount !== 0 && (
          <div className="flex justify-between">
            <span>Round Off</span>
            <span>
              {invoice.roundOffAmount > 0 ? "+" : "-"}₹{Math.abs(invoice.roundOffAmount).toFixed(2)}
            </span>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
          <span>Total</span>
          <span>₹{invoice.totalAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-medium text-blue-600">
          <span>Paid</span>
          <span>₹{invoice.paidAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-medium text-red-600">
          <span>Balance</span>
          <span>₹{invoice.balanceAmount.toFixed(2)}</span>
        </div>
      </div>

      {(invoice.ewayBillNumber ||
        invoice.transporterName ||
        invoice.vehicleNumber ||
        invoice.transportMode ||
        invoice.distanceKm) && (
        <div className="rounded-xl border bg-card p-6">
          <p className="mb-3 text-sm font-medium">E-way Bill</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {invoice.ewayBillNumber && (
              <div>
                <p className="text-xs text-muted-foreground">E-way Bill Number</p>
                <p className="font-medium">{invoice.ewayBillNumber}</p>
              </div>
            )}
            {invoice.ewayBillDate && (
              <div>
                <p className="text-xs text-muted-foreground">E-way Bill Date</p>
                <p className="font-medium">{formatShortDate(invoice.ewayBillDate)}</p>
              </div>
            )}
            {invoice.transporterName && (
              <div>
                <p className="text-xs text-muted-foreground">Transporter</p>
                <p className="font-medium">{invoice.transporterName}</p>
              </div>
            )}
            {invoice.vehicleNumber && (
              <div>
                <p className="text-xs text-muted-foreground">Vehicle Number</p>
                <p className="font-medium">{invoice.vehicleNumber}</p>
              </div>
            )}
            {invoice.transportMode && (
              <div>
                <p className="text-xs text-muted-foreground">Transport Mode</p>
                <p className="font-medium">{TRANSPORT_MODE_LABELS[invoice.transportMode]}</p>
              </div>
            )}
            {invoice.distanceKm != null && (
              <div>
                <p className="text-xs text-muted-foreground">Distance</p>
                <p className="font-medium">{invoice.distanceKm} km</p>
              </div>
            )}
          </div>
        </div>
      )}

      {invoice.notes && (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">Notes</p>
          <p className="font-medium">{invoice.notes}</p>
        </div>
      )}
    </div>
  )
}
