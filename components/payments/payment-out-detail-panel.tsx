import Link from "next/link"
import { PackagePlus, Wallet, Paperclip } from "lucide-react"

import type { PaymentOutRow } from "@/lib/actions/payments-actions"

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
 * The right-hand pane of the Payment Out master-detail layout — same
 * reasoning as PaymentInDetailPanel: every row already carries its own
 * full data (this list is never server-paginated), so this is a plain
 * presentational component, not a client-fetched panel.
 */
export function PaymentOutDetailPanel({ row }: { row: PaymentOutRow | null }) {
  if (!row) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <Wallet className="h-8 w-8" />
        <p className="text-sm">Select a payment to view its details.</p>
      </div>
    )
  }

  const partyHref = row.partyType === "VENDOR" ? `/vendors/${row.partyId}` : `/karigars/${row.partyId}`

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-red-600">{inr(row.amount)}</h2>
        <span className="text-sm text-muted-foreground">{row.date}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">{row.partyType === "VENDOR" ? "Vendor" : "Artisan"}</p>
          <Link href={partyHref} className="font-medium hover:underline">
            {row.partyName}
          </Link>
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
          <p className="text-muted-foreground">Purchase</p>
          {row.purchaseId && row.purchaseNumber ? (
            <Link
              href={`/purchases/${row.purchaseId}`}
              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
            >
              <PackagePlus className="h-3.5 w-3.5" />
              {row.purchaseNumber}
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
