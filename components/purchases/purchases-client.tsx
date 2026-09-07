"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { PurchaseTable } from "@/components/purchases/purchase-table"
import { PurchasesToolbar } from "@/components/purchases/purchases-toolbar"
import { PurchaseDetailPanel } from "@/components/purchases/purchase-detail-panel"
import { DataTablePagination } from "@/components/shared/data-table-pagination"
import type { LocationOption } from "@/components/shared/location-select"

type PurchaseRow = {
  id: string
  purchaseNumber: string
  purchaseDate: string
  status: string
  totalAmount: number
  balanceAmount: number
  vendor: { id: string; name: string; phone: string | null } | null
}

type PurchasesClientProps = {
  purchases: PurchaseRow[]
  locations: LocationOption[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
}

/**
 * Master-detail layout, same pattern as CustomersClient — the list on the
 * left stays a plain table/toolbar/pagination stack, and clicking a row
 * shows its full detail (with Edit/Delete/Record Payment) in the panel on
 * the right, instead of every action requiring a full navigation.
 */
export function PurchasesClient({ purchases, locations, pagination }: PurchasesClientProps) {
  // Defaults to the first row on this page/search result so the panel is
  // never empty on load, matching CustomersClient.
  const [activePurchaseId, setActivePurchaseId] = React.useState<string | null>(
    purchases[0]?.id ?? null,
  )

  React.useEffect(() => {
    setActivePurchaseId((current) => {
      if (current && purchases.some((purchase) => purchase.id === current)) return current
      return purchases[0]?.id ?? null
    })
  }, [purchases])

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Purchases</h1>
          <p className="text-sm text-muted-foreground">
            Showing {purchases.length} of {pagination.totalCount} purchases
          </p>
        </div>

        <Link href="/purchases/new">
          <Button>New Purchase</Button>
        </Link>
      </div>

      {/* List + detail side by side, matching the Customers page's own
          layout — stacks on narrow viewports since there's no room for
          both. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          <PurchasesToolbar />

          <PurchaseTable
            purchases={purchases}
            activePurchaseId={activePurchaseId}
            onActivate={setActivePurchaseId}
          />

          <DataTablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalCount={pagination.totalCount}
            pageSize={pagination.pageSize}
            itemLabel="purchases"
          />
        </div>

        <PurchaseDetailPanel purchaseId={activePurchaseId} locations={locations} />
      </div>
    </main>
  )
}
