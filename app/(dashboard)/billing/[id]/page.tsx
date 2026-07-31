import { notFound } from "next/navigation"

import { getInvoiceById } from "@/lib/actions/invoice-actions"
import { InvoiceStatusBadge } from "@/components/billing/invoice-status-badge"
import { RecordPaymentDialog } from "@/components/billing/record-payment-dialog"
import { PageBackHeader } from "@/components/shared/page-back-header"

type Props = {
  params: Promise<{ id: string }>
}

export default async function InvoiceDetailPage({ params }: Props) {
  const { id } = await params
  const invoice = await getInvoiceById(id)

  if (!invoice) notFound()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={invoice.invoiceNumber}
        description={invoice.customer?.name ?? ""}
        backHref="/billing"
        backLabel="Back to Billing"
        action={
          <RecordPaymentDialog
            invoiceId={invoice.id}
            balanceAmount={invoice.balanceAmount}
          />
        }
      />

      <div className="rounded-xl border bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <InvoiceStatusBadge status={invoice.status} />
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
            <p className="font-medium">
              {invoice.customer?.name} {invoice.customer?.phone ? `(${invoice.customer.phone})` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
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
                <td className="px-4 py-3">₹{item.makingCharge.toFixed(2)}</td>
                <td className="px-4 py-3">₹{item.stoneCharge.toFixed(2)}</td>
                <td className="px-4 py-3 font-medium">₹{item.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border bg-white p-6 max-w-sm ml-auto space-y-1 text-sm">
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
        <div className="rounded-xl border bg-white p-6">
          <p className="text-sm text-muted-foreground">Notes</p>
          <p className="font-medium">{invoice.notes}</p>
        </div>
      )}
    </main>
  )
}
