import Link from "next/link"

import type { CreditNoteView } from "@/lib/actions/credit-note-actions"
import { formatShortDate } from "@/lib/utils"

type CreditNoteDetailContentProps = {
  creditNote: CreditNoteView
}

/**
 * The body of a credit note's detail view — info box, line items, total
 * refunded, notes. Shared between the standalone /billing/credit-notes/[id]
 * page and the Credit Notes list's inline detail panel, same convention as
 * InvoiceDetailContent/QuotationDetailContent, so the two can never drift
 * apart.
 */
export function CreditNoteDetailContent({ creditNote }: CreditNoteDetailContentProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Credit Note Date</p>
            <p className="font-medium">{formatShortDate(creditNote.creditNoteDate)}</p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Against Invoice</p>
            <Link
              href={`/billing/${creditNote.invoice.id}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {creditNote.invoice.invoiceNumber}
            </Link>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Billed by</p>
            <p className="font-medium">
              {creditNote.createdByName ?? (
                <span className="text-muted-foreground">Not recorded</span>
              )}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Party</p>
            {creditNote.customer ? (
              <Link
                href={`/customers/${creditNote.customer.id}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {creditNote.customer.name}
                {creditNote.customer.phone ? ` (${creditNote.customer.phone})` : ""}
              </Link>
            ) : (
              <p className="font-medium">—</p>
            )}
          </div>
        </div>

        {creditNote.reason && (
          <div>
            <p className="text-sm text-muted-foreground">Reason</p>
            <p className="font-medium">{creditNote.reason}</p>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Item</th>
              <th className="px-4 py-3 text-left font-medium">Qty</th>
              <th className="px-4 py-3 text-left font-medium">Rate</th>
              <th className="px-4 py-3 text-left font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {creditNote.items.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-4 py-3">{item.itemName}</td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">{item.rate ? `₹${item.rate.toFixed(2)}` : "-"}</td>
                <td className="px-4 py-3 font-medium">₹{item.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border bg-card p-6 max-w-sm ml-auto space-y-1 text-sm">
        <div className="flex justify-between font-semibold text-base">
          <span>Total Refunded</span>
          <span className="text-red-600">₹{creditNote.totalAmount.toFixed(2)}</span>
        </div>
      </div>

      {creditNote.notes && (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">Notes</p>
          <p className="font-medium">{creditNote.notes}</p>
        </div>
      )}
    </div>
  )
}
