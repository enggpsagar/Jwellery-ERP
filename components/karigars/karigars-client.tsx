// FILE PATH: components/karigars/karigars-client.tsx
"use client"

import * as React from "react"
import Link from "next/link"

import { KarigarTable } from "@/components/karigars/karigar-table"
import { KarigarsToolbar } from "@/components/karigars/karigars-toolbar"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"
import { BulkDeleteButton } from "@/components/shared/bulk-delete-button"
import { KarigarDetailPanel } from "@/components/karigars/karigar-detail-panel"
import { KarigarImportDialog } from "@/components/karigars/karigar-import-dialog"
import { StatCards } from "@/components/dashboard/stat-cards"
import type { DashboardStat } from "@/lib/actions/dashboard-actions"
import { bulkDeleteKarigars, type Karigar } from "@/lib/actions/karigar-actions"
import type { KarigarLedgerSummary } from "@/lib/actions/ledger-actions"
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions"

type PaginationInfo = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

type KarigarsClientProps = {
  karigars: Karigar[]
  pagination: PaginationInfo
  metals: StoreMetalRow[]
  ledgerSummary: KarigarLedgerSummary
}

/** True once a balance is more than a rounding artifact — same 3dp/2dp
 *  weight/cash precision the rest of the Karigar module already rounds to. */
function hasBalance(row: { outstandingGold: number; outstandingCash: number }) {
  return Math.abs(row.outstandingGold) >= 0.0005 || Math.abs(row.outstandingCash) >= 0.005
}

function buildArtisanOverviewStats(summary: KarigarLedgerSummary): DashboardStat[] {
  const withBalance = summary.rows.filter(hasBalance).length

  return [
    {
      label: "Gold with Artisans",
      value: `${summary.totals.outstandingGold.toLocaleString("en-IN", { maximumFractionDigits: 3 })} g`,
      change: "",
      trend: "up",
      sub: "fine gold currently out, across every artisan",
      icon: "metal",
      metalName: "Gold",
    },
    {
      label: "Owed to Artisans",
      value: `₹${summary.totals.outstandingCash.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
      change: "",
      trend: "down",
      sub: "unpaid labour charges",
      icon: "wallet",
      tone: "outstanding",
    },
    {
      label: "Artisans with a Balance",
      value: `${withBalance}`,
      change: "",
      trend: "up",
      sub: `of ${summary.rows.length} total artisans`,
      icon: "hammer",
    },
  ]
}

export function KarigarsClient({
  karigars,
  pagination,
  metals,
  ledgerSummary,
}: KarigarsClientProps) {
  const [selectedKarigarIds, setSelectedKarigarIds] = React.useState<string[]>([])
  // Which row's full detail shows in the right-hand panel — defaults to
  // the first row on this page/search result so the panel is never empty
  // on load, matching the Customers/Vendors layout this mirrors.
  const [activeKarigarId, setActiveKarigarId] = React.useState<string | null>(
    karigars[0]?.id ?? null,
  )

  React.useEffect(() => {
    setSelectedKarigarIds([])
    setActiveKarigarId((current) => {
      if (current && karigars.some((karigar) => karigar.id === current)) return current
      return karigars[0]?.id ?? null
    })
  }, [karigars])

  const balanceById = React.useMemo(
    () => new Map(ledgerSummary.rows.map((row) => [row.id, row])),
    [ledgerSummary.rows],
  )
  const overviewStats = React.useMemo(
    () => buildArtisanOverviewStats(ledgerSummary),
    [ledgerSummary],
  )

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Artisans"
        description="Manage jewellery artisans and their job records."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/karigars/disabled">
              <Button variant="outline">Disabled Artisans</Button>
            </Link>
            <Link href="/karigars/ledger">
              <Button variant="outline">Artisan Ledger</Button>
            </Link>
            <KarigarImportDialog />
            <Link href="/karigars/new">
              <Button>Add Artisan</Button>
            </Link>
          </div>
        }
      />

      <StatCards stats={overviewStats} />

      {/* Toolbar lives inside the table's own column (not spanning the
          detail panel too) — it filters/sorts/exports the table, so it
          belongs with the table, not the whole page. */}
      {/* Even 50/50 split — the detail panel's own Metal/Stone/ledger
          content needs real width too, not just the list table. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
        <div className="space-y-4">
          <KarigarsToolbar
            selectedKarigarIds={selectedKarigarIds}
            metals={metals}
            bulkActions={
              <BulkDeleteButton
                selectedIds={selectedKarigarIds}
                itemLabelSingular="artisan"
                itemLabelPlural="artisans"
                getDisplayName={(id) => karigars.find((karigar) => karigar.id === id)?.name ?? id}
                onDelete={bulkDeleteKarigars}
                onDone={() => setSelectedKarigarIds([])}
              />
            }
          />

          <KarigarTable
            karigars={karigars}
            pagination={pagination}
            balanceById={balanceById}
            selectedKarigarIds={selectedKarigarIds}
            onSelectionChange={setSelectedKarigarIds}
            activeKarigarId={activeKarigarId}
            onActivate={setActiveKarigarId}
          />
        </div>

        <KarigarDetailPanel karigarId={activeKarigarId} />
      </div>
    </main>
  )
}