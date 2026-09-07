import Link from "next/link"

import type { CreditNoteView } from "@/lib/actions/credit-note-actions"
import { formatShortDate, cn } from "@/lib/utils"

type CreditNoteTableProps = {
  creditNotes: CreditNoteView[]
  /** Which row's detail is showing in the panel alongside this table — omit to keep every row as a plain navigation link. */
  activeCreditNoteId?: string | null
  onActivate?: (id: string) => void
}

export function CreditNoteTable({ creditNotes, activeCreditNoteId, onActivate }: CreditNoteTableProps) {
  if (!creditNotes.length) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No credit notes raised yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Credit Note #</th>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Customer</th>
              <th className="px-4 py-3 text-left font-medium">Against Invoice</th>
              <th className="px-4 py-3 text-left font-medium">Amount</th>
            </tr>
          </thead>

          <tbody>
            {creditNotes.map((creditNote) => {
              const isActive = activeCreditNoteId === creditNote.id
              return (
                <tr
                  key={creditNote.id}
                  onClick={() => onActivate?.(creditNote.id)}
                  className={cn(
                    "border-b last:border-0",
                    onActivate && "cursor-pointer hover:bg-accent/50",
                    isActive && "bg-accent",
                  )}
                >
                  <td className="px-4 py-3 font-medium">
                    {onActivate ? (
                      creditNote.creditNoteNumber
                    ) : (
                      <Link
                        href={`/billing/credit-notes/${creditNote.id}`}
                        className="hover:underline"
                      >
                        {creditNote.creditNoteNumber}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {formatShortDate(creditNote.creditNoteDate)}
                  </td>
                  <td className="px-4 py-3">
                    {creditNote.customer ? (
                      <Link
                        href={`/customers/${creditNote.customer.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {creditNote.customer.name}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/billing/${creditNote.invoice.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {creditNote.invoice.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-red-600">
                    -₹{creditNote.totalAmount.toFixed(2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
