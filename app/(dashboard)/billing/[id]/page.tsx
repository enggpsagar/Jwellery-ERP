import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftCircle, ArrowRightCircle, Plus, Printer } from "lucide-react"

import { getInvoiceById } from "@/lib/actions/invoice-actions"
import { getStoreLocations } from "@/lib/actions/store-location-actions"
import { resolveBackLink } from "@/lib/safe-return-to"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { InvoiceStatusBadge } from "@/components/billing/invoice-status-badge"
import { RecordPaymentDialog } from "@/components/billing/record-payment-dialog"
import { EmailInvoiceButton } from "@/components/billing/email-invoice-button"
import { ShareWhatsAppButton } from "@/components/billing/share-whatsapp-button"
import { EditInvoiceDialog } from "@/components/billing/edit-invoice-dialog"
import { CancelInvoiceDialog } from "@/components/billing/cancel-invoice-dialog"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"

type Props = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ from?: string }>
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
    getInvoiceById(id),
    getBusinessSettings(),
    getStoreLocations(),
  ])

  if (!invoice) notFound()

  const whatsappMessage = `Hi! Here is your invoice ${invoice.invoiceNumber} from ${settings.businessName}. Total: ₹${invoice.totalAmount.toFixed(2)}. Balance due: ₹${invoice.balanceAmount.toFixed(2)}.`

  const isCancelled = invoice.status === "CANCELLED"
  const isCancellable = invoice.status === "DRAFT" || invoice.status === "PARTIAL"

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
              />
            )}
            {isCancellable && (
              <CancelInvoiceDialog
                invoiceId={invoice.id}
                invoiceNumber={invoice.invoiceNumber}
                balanceAmount={invoice.balanceAmount}
              />
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
                <td className="px-4 py-3">{item.itemName}</td>
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
