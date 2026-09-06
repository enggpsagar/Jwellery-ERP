"use client"

import * as React from "react"
import Link from "next/link"
import { VendorsTable } from "@/components/vendors/vendors-table"
import { VendorsToolbar } from "@/components/vendors/vendors-toolbar"
import { Button } from "@/components/ui/button"
import { BulkDeleteButton } from "@/components/shared/bulk-delete-button"
import { VendorDetailPanel } from "@/components/vendors/vendor-detail-panel"
import { bulkDeleteVendors, type Vendor } from "@/lib/actions/vendor-actions"

type StateItem = {
  id: string
  name: string
}

type VendorsClientProps = {
  vendors: Vendor[]
  states: StateItem[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

export function VendorsClient({
  vendors,
  states,
  pagination,
}: VendorsClientProps) {
  const [selectedVendorIds, setSelectedVendorIds] = React.useState<string[]>([])
  // Which row's full detail shows in the right-hand panel — defaults to
  // the first row on this page/search result so the panel is never empty
  // on load, matching the Customers layout this mirrors.
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

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vendors</h1>
          <p className="text-sm text-muted-foreground">
            Showing {vendors.length} of {pagination.totalCount} vendors
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/vendors/archived">
            <Button variant="outline">Archived Vendors</Button>
          </Link>

          <Link href="/vendors/new">
            <Button>Add Vendor</Button>
          </Link>
        </div>
      </div>

      {/* Toolbar lives inside the table's own column (not spanning the
          detail panel too) — it filters/sorts/exports the table, so it
          belongs with the table, not the whole page. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          <VendorsToolbar
            selectedVendorIds={selectedVendorIds}
            bulkActions={
              <BulkDeleteButton
                selectedIds={selectedVendorIds}
                itemLabelSingular="vendor"
                itemLabelPlural="vendors"
                getDisplayName={(id) => vendors.find((vendor) => vendor.id === id)?.name ?? id}
                onDelete={bulkDeleteVendors}
                onDone={() => setSelectedVendorIds([])}
              />
            }
          />

          <VendorsTable
            vendors={vendors}
            states={states}
            pagination={pagination}
            selectedVendorIds={selectedVendorIds}
            onSelectionChange={setSelectedVendorIds}
            activeVendorId={activeVendorId}
            onActivate={setActiveVendorId}
          />
        </div>

        <VendorDetailPanel vendorId={activeVendorId} states={states} />
      </div>
    </main>
  )
}
