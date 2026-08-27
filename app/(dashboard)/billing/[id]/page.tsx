import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftCircle } from "lucide-react"

import { getInvoiceById } from "@/lib/actions/invoice-actions"
import { resolveBackLink } from "@/lib/safe-return-to"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { InvoiceStatusBadge } from "@/components/billing/invoice-status-badge"
import { RecordPaymentDialog } from "@/components/billing/record-payment-dialog"
import { EmailInvoiceButton } from "@/components/billing/email-invoice-button"
import { ShareWhatsAppButton } from "@/components/billing/share-whatsapp-button"
import { PageBackHeader } from "@/components/shared/page-back-header"

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
  const [invoice, settings] = await Promise.all([
    getInvoiceById(id),
    getBusinessSettings(),
  ])

  if (!invoice) notFound()

  const whatsappMessage = `Hi! Here is your invoice ${invoice.invoiceNumber} from ${settings.businessName}. Total: ₹${invoice.totalAmount.toFixed(2)}. Balance due: ₹${invoice.balanceAmount.toFixed(2)}.`

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={invoice.invoiceNumber}
        description={invoice.customer?.name ?? ""}
        backHref={backTo.href}
        backLabel={backTo.label}
        action={
          <div className="flex items-center gap-2">
            <ShareWhatsAppButton
              phone={invoice.customer?.phone}
              message={whatsappMessage}
            />
            <EmailInvoiceButton invoiceId={invoice.id} />
            <RecordPaymentDialog
              invoiceId={invoice.id}
              balanceAmount={invoice.balanceAmount}
            />
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

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Item</th>
              <th className="px-4 py-3 text-left font-medium">Qty</th>
              <th className="px-4 py-3 text-left font-medium">Net Wt (g)</th>
              <th className="px-4 py-3 text-left font-medium">Rate</th>
              <th className="px-4 py-3 text-left font-medium">Making</th>
              <th className="px-4 py-3 text-left font-medium">Stone</th>
              <th className="px-4 py-3 text-left font-medium">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-4 py-3">{item.itemName}</td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">{item.netWeight?.toFixed(3) ?? "-"}</td>
                <td className="px-4 py-3">{item.rate ? `₹${item.rate.toFixed(2)}` : "-"}</td>
                <td className="px-4 py-3">
                  ₹{item.makingCharge.toFixed(2)}
                  {item.makingChargeType === "PERCENTAGE" && item.rate && item.netWeight ? (
                    <span className="block text-xs text-muted-foreground">
                      ({((item.makingCharge / (item.rate * item.netWeight)) * 100).toFixed(2)}% of metal value)
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">₹{item.stoneCharge.toFixed(2)}</td>
                <td className="px-4 py-3 font-medium">₹{item.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
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
