"use client"

import * as React from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

import type { Karigar } from "@/lib/actions/karigar-actions"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Input } from "@/components/ui/input"
import { KarigarTable } from "@/components/karigars/karigar-table"
import { DisabledKarigarDetailPanel } from "@/components/karigars/disabled-karigar-detail-panel"

type DisabledKarigarsClientProps = {
  karigars: Karigar[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

/**
 * Same master-detail layout as the active Artisans page (search/sort/
 * paginated list on the left, full detail — including balance cards and
 * ledger — on the right), matching the same treatment already given to
 * Archived Customers/Vendors.
 */
export function DisabledKarigarsClient({
  karigars,
  pagination,
}: DisabledKarigarsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = React.useState(searchParams.get("search") ?? "")
  const [selectedKarigarIds, setSelectedKarigarIds] = React.useState<string[]>([])
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

  function updateSearch(value: string) {
    setSearch(value)
    const params = new URLSearchParams(searchParams.toString())
    if (value.trim()) params.set("search", value.trim())
    else params.delete("search")
    params.set("page", "1")
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Disabled Artisans"
        description="Artisans removed from the active list. Their job and ledger history is kept — enabling one makes it available in Artisans again."
        backHref="/karigars"
        backLabel="Back to Artisans"
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          <div className="max-w-sm">
            <Input
              placeholder="Search disabled artisans..."
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
            />
          </div>

          <KarigarTable
            karigars={karigars}
            pagination={pagination}
            selectedKarigarIds={selectedKarigarIds}
            onSelectionChange={setSelectedKarigarIds}
            activeKarigarId={activeKarigarId}
            onActivate={setActiveKarigarId}
          />
        </div>

        <DisabledKarigarDetailPanel karigarId={activeKarigarId} />
      </div>
    </main>
  )
}
