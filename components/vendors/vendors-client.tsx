"use client"

import * as React from "react"
import Link from "next/link"
import { VendorsTable } from "@/components/vendors/vendors-table"
import { VendorsToolbar } from "@/components/vendors/vendors-toolbar"
import { Button } from "@/components/ui/button"
import type { Vendor } from "@/lib/actions/vendor-actions"

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

  React.useEffect(() => {
    setSelectedVendorIds([])
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

      <VendorsToolbar selectedVendorIds={selectedVendorIds} />

      <VendorsTable
        vendors={vendors}
        states={states}
        pagination={pagination}
        selectedVendorIds={selectedVendorIds}
        onSelectionChange={setSelectedVendorIds}
      />
    </main>
  )
}
