import type { Metadata } from "next"
import { cache } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Printer } from "lucide-react"

import { getCreditNoteById } from "@/lib/actions/credit-note-actions"
import { PageBackHeader } from "@/components/shared/page-back-header"

type Props = {
  params: Promise<{ id: string }>
}

const getCreditNote = cache(getCreditNoteById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const creditNote = await getCreditNote(id)
    return { title: creditNote ? `Credit Note ${creditNote.creditNoteNumber}` : "Credit Note" }
  } catch {
    return { title: "Credit Note" }
  }
}

export default async function CreditNoteDetailPage({ params }: Props) {
  const { id } = await params
  const creditNote = await getCreditNote(id)
  if (!creditNote) notFound()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={creditNote.creditNoteNumber}
        description={creditNote.customer?.name ?? ""}
        backHref="/billing/credit-notes"
        backLabel="Back to Credit Notes"
        action={
          <Link
            href={`/billing/credit-notes/${creditNote.id}/print`}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <Printer className="h-4 w-4" />
            Print
          </Link>
        }
      />

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Credit Note Date</p>
            <p className="font-medium">
              {new Date(creditNote.creditNoteDate).toLocaleDateString("en-IN")}
            </p>
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
            <p className="text-sm text-muted-foreground">Customer</p>
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
    </main>
  )
}
