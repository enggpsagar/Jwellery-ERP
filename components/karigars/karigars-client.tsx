// FILE PATH: components/karigars/karigars-client.tsx
"use client"

import * as React from "react"
import Link from "next/link"

import { KarigarTable } from "@/components/karigars/karigar-table"
import { KarigarsToolbar } from "@/components/karigars/karigars-toolbar"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"
import { BulkDeleteButton } from "@/components/shared/bulk-delete-button"
import { bulkDeleteKarigars, type Karigar } from "@/lib/actions/karigar-actions"

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
}

export function KarigarsClient({ karigars, pagination }: KarigarsClientProps) {
  const [selectedKarigarIds, setSelectedKarigarIds] = React.useState<string[]>([])

  React.useEffect(() => {
    setSelectedKarigarIds([])
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

      <div className="flex flex-wrap items-center gap-2">
        <KarigarsToolbar selectedKarigarIds={selectedKarigarIds} />
        <BulkDeleteButton
          selectedIds={selectedKarigarIds}
          itemLabelSingular="karigar"
          itemLabelPlural="karigars"
          getDisplayName={(id) => karigars.find((karigar) => karigar.id === id)?.name ?? id}
          onDelete={bulkDeleteKarigars}
          onDone={() => setSelectedKarigarIds([])}
        />
      </div>

      <KarigarTable
        karigars={karigars}
        pagination={pagination}
        selectedKarigarIds={selectedKarigarIds}
        onSelectionChange={setSelectedKarigarIds}
      />
    </main>
  )
}