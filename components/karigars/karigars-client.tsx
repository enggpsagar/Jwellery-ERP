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

export function KarigarsClient({ karigars, pagination, metals }: KarigarsClientProps) {
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
        title="Karigars"
        description="Manage jewellery artisans and their job records."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/karigars/disabled">
              <Button variant="outline">Disabled Karigars</Button>
            </Link>
            <Link href="/karigars/ledger">
              <Button variant="outline">Karigar Ledger</Button>
            </Link>
            <Link href="/karigars/new">
              <Button>Add Karigar</Button>
            </Link>
          </div>
        }
      />

      <KarigarsToolbar
        selectedKarigarIds={selectedKarigarIds}
        metals={metals}
        bulkActions={
          <BulkDeleteButton
            selectedIds={selectedKarigarIds}
            itemLabelSingular="karigar"
            itemLabelPlural="karigars"
            getDisplayName={(id) => karigars.find((karigar) => karigar.id === id)?.name ?? id}
            onDelete={bulkDeleteKarigars}
            onDone={() => setSelectedKarigarIds([])}
          />
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <KarigarTable
          karigars={karigars}
          pagination={pagination}
          selectedKarigarIds={selectedKarigarIds}
          onSelectionChange={setSelectedKarigarIds}
          activeKarigarId={activeKarigarId}
          onActivate={setActiveKarigarId}
        />

        <KarigarDetailPanel karigarId={activeKarigarId} />
      </div>
    </main>
  )
}