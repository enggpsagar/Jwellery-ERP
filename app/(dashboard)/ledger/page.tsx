import { getLedgerEntries, getLedgerTotals } from "@/lib/actions/ledger-actions"
import { LedgerView } from "@/components/ledger/ledger-view"

export default async function LedgerPage() {
  const [entries, totals] = await Promise.all([
    getLedgerEntries(),
    getLedgerTotals(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Gold &amp; Silver Ledger
          </h1>
          <p className="text-sm text-muted-foreground">
            Track customer and karigar account activity, with invoices linked
            directly to each entry.
          </p>
        </div>
      </div>

      <LedgerView entries={entries} totals={totals} />
    </div>
  )
}
