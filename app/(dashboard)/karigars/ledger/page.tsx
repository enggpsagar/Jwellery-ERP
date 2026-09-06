// FILE PATH: app/(dashboard)/karigars/ledger/page.tsx

import type { Metadata } from "next"

import { getKarigarLedgerSummary } from "@/lib/actions/ledger-actions"

import { PageBackHeader } from "@/components/shared/page-back-header"
import { KarigarLedgerSummaryTable } from "@/components/karigars/karigar-ledger-summary-table"

export const metadata: Metadata = {
  title: "Artisan Ledger",
}

export const dynamic = "force-dynamic"

export default async function KarigarLedgerPage() {
  const summary = await getKarigarLedgerSummary()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Artisan Ledger"
        description="Gold and payment balance across every artisan."
        backHref="/karigars"
        backLabel="Back to Artisans"
      />

      <KarigarLedgerSummaryTable rows={summary.rows} totals={summary.totals} />
    </main>
  )
}
