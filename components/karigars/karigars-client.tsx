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
import { bulkDeleteKarigars, type Karigar } from "@/lib/actions/karigar-actions"
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
}

export function KarigarsClient({
  karigars,
  pagination,
  metals,
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

      {/* Toolbar lives inside the table's own column (not spanning the
          detail panel too) — it filters/sorts/exports the table, so it
          belongs with the table, not the whole page. */}
      {/* The left list table only has 5 narrow columns (Code/Name/Mobile/
          City/Opening Gold); the right panel's Material Ledger table has far
          more (date/type/metal/debit/credit/balance) and needs the room —
          give it the larger share instead of the list. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,1fr)_minmax(0,1.6fr)] xl:items-start">
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