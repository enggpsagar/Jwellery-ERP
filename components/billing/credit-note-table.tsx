import Link from "next/link"
import { Eye } from "lucide-react"

import type { CreditNoteView } from "@/lib/actions/credit-note-actions"

type CreditNoteTableProps = {
  creditNotes: CreditNoteView[]
}

export function CreditNoteTable({ creditNotes }: CreditNoteTableProps) {
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
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {creditNotes.map((creditNote) => (
              <tr key={creditNote.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{creditNote.creditNoteNumber}</td>
                <td className="px-4 py-3">
                  {new Date(creditNote.creditNoteDate).toLocaleDateString("en-IN")}
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
                <td className="px-4 py-3">
                  <Link
                    href={`/billing/credit-notes/${creditNote.id}`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
                    title="View credit note"
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
