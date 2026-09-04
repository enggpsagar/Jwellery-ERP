import type { Metadata } from "next"
import { cache } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftCircle, ArrowRightCircle, Pencil, Plus, Printer, Receipt } from "lucide-react"

import { getInvoiceById } from "@/lib/actions/invoice-actions"
import { getCreditNotesForInvoice } from "@/lib/actions/credit-note-actions"
import { getStoreLocations } from "@/lib/actions/store-location-actions"
import { resolveBackLink } from "@/lib/safe-return-to"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getReturnEligibility } from "@/lib/return-window"
import { APP_NAME } from "@/lib/constants/app"
import { InvoiceStatusBadge } from "@/components/billing/invoice-status-badge"
import { RecordPaymentDialog } from "@/components/billing/record-payment-dialog"
import { EmailInvoiceButton } from "@/components/billing/email-invoice-button"
import { ShareWhatsAppButton } from "@/components/billing/share-whatsapp-button"
import { EditInvoiceDialog } from "@/components/billing/edit-invoice-dialog"
import { CancelInvoiceDialog } from "@/components/billing/cancel-invoice-dialog"
import { ReturnItemsDialog } from "@/components/billing/return-items-dialog"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"

type Props = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ from?: string }>
}

// Shared with generateMetadata below so the invoice is only fetched once
// per request rather than once for the tab title and again for the page.
const getInvoice = cache(getInvoiceById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const invoice = await getInvoice(id)
    return { title: invoice ? `Invoice ${invoice.invoiceNumber}` : "Invoice" }
  } catch {
    return { title: "Invoice" }
  }
}

export default async function InvoiceDetailPage({ params, searchParams }: Props) {
  const { id } = await params

  // Invoices are opened from the billing list, the ledger and Reports, so
  // "back" follows whoever linked here.
  const backTo = resolveBackLink((await searchParams)?.from, {
    href: "/billing",
    label: "Back to Billing",
  })
  const [invoice, settings, locations] = await Promise.all([
    getInvoice(id),
    getBusinessSettings(),
    getStoreLocations(),
  ])

  if (!invoice) notFound()

  const creditNotes = await getCreditNotesForInvoice(invoice.id)

  const whatsappMessage = `Hi! Here is your invoice ${invoice.invoiceNumber} from ${settings.businessName}. Total: ₹${invoice.totalAmount.toFixed(2)}. Balance due: ₹${invoice.balanceAmount.toFixed(2)}.\n\nSent via ${APP_NAME}`

  const isCancelled = invoice.status === "CANCELLED"
  // Same statuses on purpose: a fully paid invoice's total can't silently
  // change without a real refund decision, so PAID only ever gets the
  // basic date/location/notes dialog — not line-item editing, not cancel.
  const isCancellable = invoice.status === "DRAFT" || invoice.status === "PARTIAL"
  const canFullyEdit = isCancellable
  const isPaid = invoice.status === "PAID"

  // Returns only ever apply to an invoice the customer actually paid for
  // and took delivery of — DRAFT (never billed) and CANCELLED (already
  // reversed) invoices have nothing to return.
  const isReturnable = invoice.status === "PAID" || invoice.status === "PARTIAL"
  const returnEligibility = getReturnEligibility(
    new Date(invoice.invoiceDate),
    settings.returnWindowDays,
  )
  const canReturnItems = isReturnable && returnEligibility.eligible

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={invoice.invoiceNumber}
        description={invoice.customer?.name ?? ""}
        backHref={backTo.href}
        backLabel={backTo.label}
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/billing/${invoice.id}/print`}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              <Printer className="h-4 w-4" />
              Print
            </Link>
            <ShareWhatsAppButton
              phone={invoice.customer?.phone}
              message={whatsappMessage}
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
            />
            <EmailInvoiceButton invoiceId={invoice.id} />
            {isPaid && (
              <EditInvoiceDialog
                invoiceId={invoice.id}
                invoiceDate={invoice.invoiceDate}
                dueDate={invoice.dueDate}
                notes={invoice.notes}
                locationId={invoice.locationId ?? null}
                locations={locations}
              />
            )}
            {canFullyEdit && (
              <Button asChild variant="outline" className="gap-2">
                <Link href={`/billing/${invoice.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Link>
              </Button>
            )}
            {isCancellable && (
              <CancelInvoiceDialog
                invoiceId={invoice.id}
                invoiceNumber={invoice.invoiceNumber}
                balanceAmount={invoice.balanceAmount}
              />
            )}
            {canReturnItems && (
              <ReturnItemsDialog invoiceId={invoice.id} invoiceNumber={invoice.invoiceNumber} />
            )}
            {!isCancelled && (
              <RecordPaymentDialog
                invoiceId={invoice.id}
                balanceAmount={invoice.balanceAmount}
              />
            )}
          </div>
        }
      />

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
                  Converted from Kacha Slip ({invoice.convertedFromKacha.slipNumber})
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

          <div>
            <p className="text-sm text-muted-foreground">Invoice Date</p>
            <p className="font-medium">
              {new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}
            </p>
          </div>

          {invoice.dueDate && (
            <div>
              <p className="text-sm text-muted-foreground">Due Date</p>
              <p className="font-medium">
                {new Date(invoice.dueDate).toLocaleDateString("en-IN")}
              </p>
            </div>
          )}

          {isReturnable && (
            <div>
              <p className="text-sm text-muted-foreground">Return Window</p>
              {returnEligibility.eligible ? (
                <p className="font-medium text-green-700">
                  Eligible until {returnEligibility.windowExpiresAt.toLocaleDateString("en-IN")}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {returnEligibility.daysRemaining} day{returnEligibility.daysRemaining === 1 ? "" : "s"} left
                  </span>
                </p>
              ) : (
                <p className="font-medium text-red-600">
                  Expired {returnEligibility.windowExpiresAt.toLocaleDateString("en-IN")}
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
              {invoice.createdByName ?? (
                <span className="text-muted-foreground">Not recorded</span>
              )}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Customer</p>
            {invoice.customer ? (
              <Link
                href={`/customers/${invoice.customer.id}?from=${encodeURIComponent(`/billing/${invoice.id}`)}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {invoice.customer.name}
                {invoice.customer.phone ? ` (${invoice.customer.phone})` : ""}
              </Link>
            ) : (
              // An invoice always has a customer in practice, but the mapped
              // shape allows null — render plain text rather than a link to
              // /customers/undefined.
              <p className="font-medium">—</p>
            )}
          </div>
        </div>
      </div>

      {isCancelled && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 space-y-3">
          <div>
            <p className="font-medium text-red-700">This invoice was cancelled</p>
            <p className="text-sm text-red-700/80">
              {invoice.cancelledAt &&
                new Date(invoice.cancelledAt).toLocaleString("en-IN")}
              {invoice.cancelledByName ? ` · by ${invoice.cancelledByName}` : ""}
            </p>
            {invoice.cancellationReason && (
              <p className="mt-1 text-sm text-red-700/80">
                Reason: {invoice.cancellationReason}
              </p>
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
                    {new Date(creditNote.creditNoteDate).toLocaleDateString("en-IN")}
                  </span>
                </span>
                <span className="font-medium text-red-600">
                  -₹{creditNote.totalAmount.toFixed(2)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Item</th>
              <th className="px-4 py-3 text-left font-medium">Qty</th>
              <th className="px-4 py-3 text-left font-medium">Weight</th>
              <th className="px-4 py-3 text-left font-medium">Rate</th>
              <th className="px-4 py-3 text-left font-medium">Making</th>
              <th className="px-4 py-3 text-left font-medium">Stone</th>
              <th className="px-4 py-3 text-left font-medium">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => {
              // Diamonds price and display by carat, not gram weight — same
              // unit toLineQuantity used to save this line's own total.
              const isDiamond = item.purity === "DIAMOND"
              const quantity = isDiamond ? item.caratWeight : item.netWeight
              return (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  {item.itemName}
                  {item.stoneMetalTypeName ? (
                    <span className="block text-xs text-muted-foreground">
                      Stone: {item.stoneMetalTypeName}
                      {item.stoneTypeNames ? ` (${item.stoneTypeNames})` : ""}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">
                  {quantity != null ? `${quantity.toFixed(3)} ${isDiamond ? "ct" : "g"}` : "-"}
                </td>
                <td className="px-4 py-3">{item.rate ? `₹${item.rate.toFixed(2)}` : "-"}</td>
                <td className="px-4 py-3">
                  ₹{item.makingCharge.toFixed(2)}
                  {item.makingChargeType === "PERCENTAGE" && item.rate && quantity ? (
                    <span className="block text-xs text-muted-foreground">
                      ({((item.makingCharge / (item.rate * quantity)) * 100).toFixed(2)}% of metal value)
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">₹{item.stoneCharge.toFixed(2)}</td>
                <td className="px-4 py-3 font-medium">₹{item.lineTotal.toFixed(2)}</td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border bg-card p-6 max-w-sm ml-auto space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>₹{invoice.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Making Charges</span>
          <span>₹{invoice.makingCharges.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Stone Charges</span>
          <span>₹{invoice.stoneCharges.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Discount</span>
          <span>-₹{invoice.discount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span>₹{invoice.taxAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
          <span>Total</span>
          <span>₹{invoice.totalAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Paid</span>
          <span>₹{invoice.paidAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-red-600 font-medium">
          <span>Balance</span>
          <span>₹{invoice.balanceAmount.toFixed(2)}</span>
        </div>
      </div>

      {invoice.notes && (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">Notes</p>
          <p className="font-medium">{invoice.notes}</p>
        </div>
      )}
    </main>
  )
}
