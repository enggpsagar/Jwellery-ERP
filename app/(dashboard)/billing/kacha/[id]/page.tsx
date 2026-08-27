import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRightCircle } from "lucide-react"

import { getKachaInvoiceById } from "@/lib/actions/kacha-invoice-actions"
import { InvoiceStatusBadge } from "@/components/billing/invoice-status-badge"
import { RecordKachaPaymentDialog } from "@/components/billing/kacha/record-kacha-payment-dialog"
import { EmailKachaInvoiceButton } from "@/components/billing/kacha/email-kacha-invoice-button"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"

type Props = {
  params: Promise<{ id: string }>
}

export default async function KachaInvoiceDetailPage({ params }: Props) {
  const { id } = await params
  const kachaInvoice = await getKachaInvoiceById(id)

  if (!kachaInvoice) notFound()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={kachaInvoice.slipNumber}
        description={kachaInvoice.customer?.name ?? ""}
        backHref="/billing/kacha"
        backLabel="Back to Kacha Slips"
        action={
          <div className="flex items-center gap-2">
            {kachaInvoice.convertedTo ? (
              <Link href={`/billing/${kachaInvoice.convertedTo.id}`}>
                <Button variant="outline" className="gap-2">
                  <ArrowRightCircle className="h-4 w-4" />
                  View Pakka Invoice ({kachaInvoice.convertedTo.invoiceNumber})
                </Button>
              </Link>
            ) : (
              <Link href={`/billing/kacha/${kachaInvoice.id}/convert`}>
                <Button variant="outline">Convert to Pakka</Button>
              </Link>
            )}

            <EmailKachaInvoiceButton kachaInvoiceId={kachaInvoice.id} />

            <RecordKachaPaymentDialog
              kachaInvoiceId={kachaInvoice.id}
              balanceAmount={kachaInvoice.balanceAmount}
            />
          </div>
        }
      />

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <div className="flex flex-wrap items-center gap-2">
              <InvoiceStatusBadge status={kachaInvoice.status} />
              {kachaInvoice.convertedTo && (
                <Link
                  href={`/billing/${kachaInvoice.convertedTo.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  <ArrowRightCircle className="h-3.5 w-3.5" />
                  Converted to Pakka Invoice
                </Link>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Slip Date</p>
            <p className="font-medium">
              {new Date(kachaInvoice.invoiceDate).toLocaleDateString("en-IN")}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Customer</p>
            {kachaInvoice.customer ? (
              <Link
                href={`/customers/${kachaInvoice.customer.id}?from=${encodeURIComponent(`/billing/kacha/${kachaInvoice.id}`)}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {kachaInvoice.customer.name}
                {kachaInvoice.customer.phone
                  ? ` (${kachaInvoice.customer.phone})`
                  : ""}
              </Link>
            ) : (
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
            {kachaInvoice.items.map((item: (typeof kachaInvoice.items)[number]) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-4 py-3">{item.itemName}</td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">{item.netWeight?.toFixed(3) ?? "-"}</td>
                <td className="px-4 py-3">{item.rate ? `₹${item.rate.toFixed(2)}` : "-"}</td>
                <td className="px-4 py-3">₹{item.makingCharge.toFixed(2)}</td>
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
          <span>₹{kachaInvoice.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Making Charges</span>
          <span>₹{kachaInvoice.makingCharges.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Stone Charges</span>
          <span>₹{kachaInvoice.stoneCharges.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Discount</span>
          <span>-₹{kachaInvoice.discount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
          <span>Total</span>
          <span>₹{kachaInvoice.totalAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Paid</span>
          <span>₹{kachaInvoice.paidAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-red-600 font-medium">
          <span>Balance</span>
          <span>₹{kachaInvoice.balanceAmount.toFixed(2)}</span>
        </div>
      </div>

      {kachaInvoice.notes && (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">Notes</p>
          <p className="font-medium">{kachaInvoice.notes}</p>
        </div>
      )}
    </main>
  )
}
