// components/customers/ledger/customer-ledger-body.tsx
"use client"

import { useWeightFormat } from "@/components/providers/weight-settings-provider"
import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronUp, PackagePlus, Receipt } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ExportMenu } from "@/components/shared/export-menu"
import type { PartyLedger } from "@/lib/actions/customer-ledger-actions"
import { formatPartyAmount } from "@/lib/party-balance"
import { EmailLedgerStatementButton } from "@/components/customers/ledger/email-ledger-statement-button"
import { CustomerLedgerHistoryTable } from "@/components/customers/ledger/customer-ledger-history-table"
import { CustomerReturnActions } from "@/components/customers/ledger/customer-return-actions"
import { PartyBalance } from "@/components/customers/party-balance"

type CustomerLedgerBodyProps = {
  customerId: string
  hasEmail: boolean
  ledger: PartyLedger | null
  /** Start with the history open (e.g. the Purchases page's party panel,
   *  where the entries are the point). */
  defaultShowDetails?: boolean
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-1 text-sm font-semibold">{children}</div>
    </div>
  )
}

/**
 * The Party Ledger — ONE ledger per party (user decision 2026-10-13):
 * sales, purchases, payments in and out, returns and exchanges together,
 * with one running net balance (lib/party-balance.ts). No data fetching of
 * its own, so it renders from either the server-fetched CustomerLedgerCard
 * or the client-fetched CustomerLedgerCardClient.
 */
export function CustomerLedgerBody({
  customerId,
  hasEmail,
  ledger,
  defaultShowDetails = false,
}: CustomerLedgerBodyProps) {
  const wf = useWeightFormat()
  const [showDetails, setShowDetails] = useState(defaultShowDetails)
  const rows = ledger?.rows ?? []
  const summary = ledger?.summary ?? null
  const from = encodeURIComponent(`/customers/${customerId}`)

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Party Ledger</h2>

      {/* Everything you can do with a party, from its own page: sell to it,
          buy from it, take or make a payment. Each pre-selects this party on
          the form it opens. Refund/Replace hide themselves when there is no
          past sale to act against. */}
      <div className="flex flex-wrap gap-3">
        {hasEmail ? <EmailLedgerStatementButton customerId={customerId} /> : null}
        <Button asChild className="gap-2">
          <Link href={`/billing/new?customerId=${customerId}&from=${from}`}>
            <Receipt className="h-4 w-4" />
            Sale
          </Link>
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <Link href={`/purchases/new?vendorId=${customerId}`}>
            <PackagePlus className="h-4 w-4" />
            Purchase
          </Link>
        </Button>
        <Button variant="success" asChild>
          <Link href={`/payments/in?customerId=${customerId}`}>Payment In</Link>
        </Button>
        <Button variant="warning" asChild>
          <Link href={`/payments/out?vendorId=${customerId}`}>Payment Out</Link>
        </Button>
        <CustomerReturnActions customerId={customerId} />
        {rows.length > 0 ? (
          <ExportMenu href={`/customers/${customerId}/ledger-export`} label="Export Ledger" />
        ) : null}
      </div>

      {summary && (
        <div className="space-y-4">
          {/* Hidden when nothing was ever recorded — ₹0 cards for a party
              with no history are clutter, not information. auto-fit so the
              cards also fit the narrow Parties side panel. */}
          {summary.moneyActive && (summary.openingBalance !== 0 || rows.length > 0) && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
              {summary.openingBalance !== 0 && (
                <SummaryCard title="Opening Balance">
                  <PartyBalance net={summary.openingBalance} />
                </SummaryCard>
              )}
              <SummaryCard title="Total Debit">
                <span className="text-red-600">{formatPartyAmount(summary.debitTotal)}</span>
                <span className="block text-[11px] font-normal text-muted-foreground">sales, payments out</span>
              </SummaryCard>
              <SummaryCard title="Total Credit">
                <span className="text-green-600">{formatPartyAmount(summary.creditTotal)}</span>
                <span className="block text-[11px] font-normal text-muted-foreground">
                  purchases, payments in, returns
                </span>
              </SummaryCard>
              <SummaryCard title="Net Balance">
                <span data-testid="party-ledger-net">
                  <PartyBalance net={summary.netBalance} />
                </span>
              </SummaryCard>
              {summary.metalsPurchased.length > 0 && (
                <SummaryCard title="Metal Bought">
                  {summary.metalsPurchased.map((metal) => (
                    <p key={`${metal.label}|${metal.unit}`} className="text-foreground">
                      {metal.label}: {metal.unit === "ct" ? wf.ct(metal.weight) : wf.g(metal.weight)} {metal.unit}
                    </p>
                  ))}
                </SummaryCard>
              )}
            </div>
          )}

          {summary.unitSummaries.map((unit) => {
            const format = (value: number) =>
              unit.isGemstone ? `${wf.ct(value)} ct` : `${wf.g(value)} g`
            return (
              <div key={unit.unit} className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                <SummaryCard title={`${unit.label} Debit`}>
                  <span className="text-red-600">{format(unit.debitTotal)}</span>
                </SummaryCard>
                <SummaryCard title={`${unit.label} Credit`}>
                  <span className="text-green-600">{format(unit.creditTotal)}</span>
                </SummaryCard>
                <SummaryCard title={`${unit.label} Balance`}>{format(unit.currentBalance)}</SummaryCard>
              </div>
            )
          })}
        </div>
      )}

      {rows.length > 0 && summary && (
        <>
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex w-full items-center justify-between gap-2 px-4 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Ledger History</h3>
                <p className="text-xs text-muted-foreground">
                  {rows.length} entr{rows.length === 1 ? "y" : "ies"}
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

          {showDetails && <CustomerLedgerHistoryTable rows={rows} summary={summary} />}
        </>
      )}
    </section>
  )
}
