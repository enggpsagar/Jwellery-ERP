import Link from "next/link"
import { Receipt, Wallet, Paperclip } from "lucide-react"

import type { PaymentInRow } from "@/lib/actions/payments-actions"

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  NET_BANKING: "Net Banking",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
}

function inr(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

/**
 * The right-hand pane of the Payment In master-detail layout — every row
 * already carries its own full data (this list is never server-paginated,
 * see PaymentsInTable), so this is a plain presentational component, not a
 * client-fetched panel like Invoice/Purchase's own — there's no separate
 * detail record to go fetch by id. Surfaces Payment Reference/Bank Name/
 * Attachment, which the table row itself has no room for.
 */
export function PaymentInDetailPanel({ row }: { row: PaymentInRow | null }) {
  if (!row) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <Wallet className="h-8 w-8" />
        <p className="text-sm">Select a payment to view its details.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-emerald-600">{inr(row.amount)}</h2>
        <span className="text-sm text-muted-foreground">{row.date}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Customer</p>
          {row.customerId ? (
            <Link href={`/customers/${row.customerId}`} className="font-medium hover:underline">
              {row.customerName}
            </Link>
          ) : (
            <p className="font-medium">{row.customerName}</p>
          )}
        </div>

        <div>
          <p className="text-muted-foreground">Method</p>
          <p className="font-medium">
            {row.paymentMethod ? PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod : "-"}
          </p>
        </div>

        <div>
          <p className="text-muted-foreground">Reference #</p>
          <p className="font-medium">{row.paymentReference || "-"}</p>
        </div>

        <div>
          <p className="text-muted-foreground">Bank Name</p>
          <p className="font-medium">{row.bankName || "-"}</p>
        </div>

        <div>
          <p className="text-muted-foreground">Invoice</p>
          {row.invoiceId && row.invoiceNumber ? (
            <Link
              href={`/billing/${row.invoiceId}`}
              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
            >
              <Receipt className="h-3.5 w-3.5" />
              {row.invoiceNumber}
            </Link>
          ) : (
            <p className="font-medium text-muted-foreground">On account</p>
          )}
        </div>

        {row.attachmentUrl && (
          <div>
            <p className="text-muted-foreground">Attachment</p>
            <a
              href={row.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
            >
              <Paperclip className="h-3.5 w-3.5" />
              View receipt
            </a>
          </div>
        )}
      </div>

      {row.description && (
        <div className="border-t pt-3 text-sm">
          <p className="text-muted-foreground">Description</p>
          <p className="font-medium">{row.description}</p>
        </div>
      )}
    </div>
  )
}
