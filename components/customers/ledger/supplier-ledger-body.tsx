"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronUp, PackagePlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { SupplierLedgerEntryItem } from "@/lib/actions/customer-ledger-actions"
import { SupplierLedgerHistoryTable } from "@/components/customers/ledger/supplier-ledger-history-table"

function formatAmount(value: number) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

type SupplierLedgerBodyProps = {
  customerId: string
  entries: SupplierLedgerEntryItem[]
}

/**
 * The supplier ledger's presentation — mirrors CustomerLedgerBody's own
 * action-bar + summary + collapsible-history shape, but for this same
 * Party's supplier-side activity. "New Purchase" / "Pay Out" are the
 * supplier-side equivalent of that component's "Sale" / "Receive Payment"
 * — until these were added, there was no way to start a Purchase or record
 * a Payment Out from a party's own page at all; both had to be started
 * from scratch on /purchases/new or /payments/out and this party re-picked
 * from a dropdown there.
 */
export function SupplierLedgerBody({ customerId, entries }: SupplierLedgerBodyProps) {
  const [showDetails, setShowDetails] = useState(false)

  // Same CREDIT/DEBIT polarity as lib/core/customer.ts' mapCustomer
  // supplierBalance — CREDIT (a Purchase's balance due) increases what's
  // owed, DEBIT (a Payment Out) reduces it.
  const totalOwed = entries.reduce((sum, e) => (e.type === "CREDIT" ? sum + e.amount : sum), 0)
  const totalPaid = entries.reduce((sum, e) => (e.type === "DEBIT" ? sum + e.amount : sum), 0)
  const currentBalance = totalOwed - totalPaid

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button asChild className="gap-2">
          <Link href={`/purchases/new?vendorId=${customerId}`}>
            <PackagePlus className="h-4 w-4" />
            New Purchase
          </Link>
        </Button>
        <Button variant="success" asChild>
          <Link href={`/payments/out?vendorId=${customerId}`}>Pay Out</Link>
        </Button>
      </div>

      {entries.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total Purchases (Owed)
            </p>
            <p className="mt-1 text-sm font-semibold text-red-600">{formatAmount(totalOwed)}</p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total Paid
            </p>
            <p className="mt-1 text-sm font-semibold text-green-600">{formatAmount(totalPaid)}</p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Current Supplier Balance
            </p>
            <p
              className={cn(
                "mt-1 text-sm font-semibold",
                currentBalance > 0
                  ? "text-red-600"
                  : currentBalance < 0
                    ? "text-blue-600"
                    : "text-foreground",
              )}
            >
              {formatAmount(currentBalance)}
            </p>
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <>
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex w-full items-center justify-between gap-2 px-4 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Supplier Ledger History</h3>
                <p className="text-xs text-muted-foreground">
                  {entries.length} entr{entries.length === 1 ? "y" : "ies"}
                  {!showDetails ? " — click to view details" : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowDetails((prev) => !prev)}
              >
                {showDetails ? (
                  <>
                    Hide Details
                    <ChevronUp className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    View Details
                    <ChevronDown className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>

          {showDetails && <SupplierLedgerHistoryTable entries={entries} />}
        </>
      )}
    </section>
  )
}
