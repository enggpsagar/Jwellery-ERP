import type { Metadata } from "next"

import {
  getLedgerEntries,
  getLedgerTotals,
  getMetalDailyLedger,
} from "@/lib/actions/ledger-actions"
import { LedgerTabs } from "@/components/ledger/ledger-tabs"

export const metadata: Metadata = {
  title: "Ledger",
}

export default async function LedgerPage() {
  const [entries, totals, metalDaily] = await Promise.all([
    getLedgerEntries(),
    getLedgerTotals(),
    getMetalDailyLedger(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Ledger
          </h1>
          <p className="text-sm text-muted-foreground">
            Track customer and karigar account activity, with invoices linked
            directly to each entry.
          </p>
        </div>
      </div>

      <LedgerTabs entries={entries} totals={totals} metalDaily={metalDaily} />
    </div>
  )
}
