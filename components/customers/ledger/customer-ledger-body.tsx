// components/customers/ledger/customer-ledger-body.tsx
"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

import { Button } from "@/components/ui/button"

import type { CustomerLedgerEntryItem, CustomerLedgerSummary } from "@/lib/actions/customer-ledger-actions"
import type { BusinessUnitOption } from "@/lib/business-units.server"
import { cn } from "@/lib/utils"
import { AddCustomerSaleEntryDialog } from "@/components/customers/ledger/add-customer-sale-entry-dialog"
import { AddCustomerRefundEntryDialog } from "@/components/customers/ledger/add-customer-refund-entry-dialog"
import { EmailLedgerStatementButton } from "@/components/customers/ledger/email-ledger-statement-button"
import { CustomerLedgerHistoryTable } from "@/components/customers/ledger/customer-ledger-history-table"

function formatAmount(value: number) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatWeight(value: number) {
  return `${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} g`
}

function formatCarat(value: number) {
  return `${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} ct`
}

type CustomerLedgerBodyProps = {
  customerId: string
  hasEmail: boolean
  entries: CustomerLedgerEntryItem[]
  summary: CustomerLedgerSummary | null
  activeUnits: BusinessUnitOption[]
}

/**
 * The customer ledger's presentation — no data fetching of its own, so it
 * has no server-only imports and can be rendered from either the
 * server-fetched CustomerLedgerCard or the client-fetched
 * CustomerLedgerCardClient.
 */
export function CustomerLedgerBody({
  customerId,
  hasEmail,
  entries,
  summary,
  activeUnits,
}: CustomerLedgerBodyProps) {
  // Collapsed by default — the summary cards above already answer "where do
  // things stand," so the full transaction-by-transaction history (which
  // can run long) stays out of the way until someone actually asks for it.
  const [showDetails, setShowDetails] = useState(false)

  return (
    <section className="space-y-4">
      {/* Just the actions, no bordered header card around them — a "Ledger"
          heading and a description restating what the buttons already say
          isn't information, and this bar is the first thing on the page,
          so it's already positioned for easy access. Email Ledger only
          appears when there's actually an address to send it to. */}
      <div className="flex flex-wrap gap-3">
        {hasEmail ? <EmailLedgerStatementButton customerId={customerId} /> : null}
        <AddCustomerSaleEntryDialog
          customerId={customerId}
          activeUnits={activeUnits}
        />
        <AddCustomerRefundEntryDialog
          customerId={customerId}
          activeUnits={activeUnits}
        />
      </div>

      {summary && (
        <div className="space-y-4">
          {/* Hidden when the customer has no actual activity — an opening
              balance and a running ₹0.00 debit/credit/balance on every card
              is clutter, not information, for a customer nothing has ever
              been recorded against. */}
          {summary.moneyActive &&
            (summary.openingBalance !== 0 ||
              summary.ledgerDebitTotal !== 0 ||
              summary.ledgerCreditTotal !== 0) && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Opening Balance
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatAmount(summary.openingBalance)}
                </p>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total Sales (Debit)
                </p>
                <p className="mt-1 text-sm font-semibold text-red-600">
                  {formatAmount(summary.ledgerDebitTotal)}
                </p>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total Refund / Received (Credit)
                </p>
                <p className="mt-1 text-sm font-semibold text-green-600">
                  {formatAmount(summary.ledgerCreditTotal)}
                </p>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Current Ledger Balance
                </p>
                <p
                  className={cn(
                    "mt-1 text-sm font-semibold",
                    summary.currentBalance > 0
                      ? "text-red-600"
                      : summary.currentBalance < 0
                        ? "text-blue-600"
                        : "text-foreground",
                  )}
                >
                  {formatAmount(summary.currentBalance)}
                </p>
              </div>
            </div>
          )}

          {summary.unitSummaries.map((unit) => {
            const format = unit.isGemstone ? formatCarat : formatWeight

            return (
              <div key={unit.unit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {unit.label} Debit
                  </p>
                  <p className="mt-1 text-sm font-semibold text-red-600">
                    {format(unit.debitTotal)}
                  </p>
                </div>

                <div className="rounded-lg border bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {unit.label} Credit
                  </p>
                  <p className="mt-1 text-sm font-semibold text-green-600">
                    {format(unit.creditTotal)}
                  </p>
                </div>

                <div className="rounded-lg border bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {unit.label} Balance
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {format(unit.currentBalance)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex w-full items-center justify-between gap-2 px-4 py-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Ledger History</h3>
            <p className="text-xs text-muted-foreground">
              {entries.length} entr{entries.length === 1 ? "y" : "ies"}
              {!showDetails && entries.length > 0 ? " — click to view details" : ""}
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

      {showDetails && <CustomerLedgerHistoryTable entries={entries} />}
    </section>
  )
}
