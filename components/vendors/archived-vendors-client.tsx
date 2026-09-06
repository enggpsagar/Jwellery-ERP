"use client"

import * as React from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

import type { Vendor } from "@/lib/actions/vendor-actions"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Input } from "@/components/ui/input"
import { VendorsTable } from "@/components/vendors/vendors-table"
import { ArchivedVendorDetailPanel } from "@/components/vendors/archived-vendor-detail-panel"

type ArchivedVendorsClientProps = {
  vendors: Vendor[]
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
 * Same master-detail layout as the active Vendors page (search/sort/
 * paginated list on the left, full detail — including the ledger — on
 * the right), matching the same treatment already given to Archived
 * Customers and Disabled Artisans.
 */
export function ArchivedVendorsClient({
  vendors,
  pagination,
}: ArchivedVendorsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = React.useState(searchParams.get("search") ?? "")
  const [selectedVendorIds, setSelectedVendorIds] = React.useState<string[]>([])
  const [activeVendorId, setActiveVendorId] = React.useState<string | null>(
    vendors[0]?.id ?? null,
  )

  React.useEffect(() => {
    setSelectedVendorIds([])
    setActiveVendorId((current) => {
      if (current && vendors.some((vendor) => vendor.id === current)) return current
      return vendors[0]?.id ?? null
    })
  }, [vendors])

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
        title="Archived Vendors"
        description="Vendors removed from the active list. Restoring one makes it available in Vendors again."
        backHref="/vendors"
        backLabel="Back to Vendors"
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          <div className="max-w-sm">
            <Input
              placeholder="Search archived vendors..."
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
            />
          </div>

          <VendorsTable
            vendors={vendors}
            pagination={pagination}
            selectedVendorIds={selectedVendorIds}
            onSelectionChange={setSelectedVendorIds}
            activeVendorId={activeVendorId}
            onActivate={setActiveVendorId}
          />
        </div>

        <ArchivedVendorDetailPanel vendorId={activeVendorId} />
      </div>
    </main>
  )
}
