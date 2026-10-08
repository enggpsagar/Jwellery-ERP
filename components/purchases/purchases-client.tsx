"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { PurchaseTable } from "@/components/purchases/purchase-table"
import { PurchaseSupplierGroups, type SupplierGroup } from "@/components/purchases/purchase-supplier-groups"
import { usePathname, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
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
  /** Grouped by supplier (the default view); null in the flat "bills" view. */
  groups: SupplierGroup[] | null
  view: "supplier" | "bills"
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
export function PurchasesClient({ purchases, groups, view, locations, pagination }: PurchasesClientProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const viewHref = (next: "supplier" | "bills") => {
    const query = new URLSearchParams(searchParams.toString())
    if (next === "bills") query.set("view", "bills")
    else query.delete("view")
    query.delete("page")
    return `${pathname}?${query.toString()}`
  }
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
            {view === "supplier"
              ? `${pagination.totalCount} supplier${pagination.totalCount === 1 ? "" : "s"} · ${purchases.length} bills shown`
              : `Showing ${purchases.length} of ${pagination.totalCount} purchases`}
          </p>
          <div className="mt-2 inline-flex rounded-md border p-0.5 text-sm" role="tablist" aria-label="Purchases view">
            {(["supplier", "bills"] as const).map((option) => (
              <Link
                key={option}
                href={viewHref(option)}
                role="tab"
                aria-selected={view === option}
                className={cn(
                  "rounded px-3 py-1",
                  view === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option === "supplier" ? "By supplier" : "All bills"}
              </Link>
            ))}
          </div>
        </div>

        {/* New Purchase records a supplier bill (payable + GST) for new or
            existing products. Add Stock is for stock that isn't a supplier
            purchase — opening stock, own manufacture, corrections — and
            posts no payable or GST. Same blue as the product panel's own
            Add Stock button. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            className="bg-[var(--chart-1)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-1)_88%,black)]"
            title="Add stock that isn't a supplier purchase — no payable or GST is recorded"
          >
            <Link href={`/inventory/stock/new?returnTo=${encodeURIComponent("/purchases")}`}>Add Stock</Link>
          </Button>
          <Button asChild>
            <Link href="/purchases/new">New Purchase</Link>
          </Button>
        </div>
      </div>

      {/* List + detail side by side, matching the Customers page's own
          layout — stacks on narrow viewports since there's no room for
          both. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          <PurchasesToolbar />

          {groups ? (
            <PurchaseSupplierGroups
              groups={groups}
              activePurchaseId={activePurchaseId}
              onActivate={setActivePurchaseId}
            />
          ) : (
            <PurchaseTable
              purchases={purchases}
              activePurchaseId={activePurchaseId}
              onActivate={setActivePurchaseId}
            />
          )}

          <DataTablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalCount={pagination.totalCount}
            pageSize={pagination.pageSize}
            itemLabel={view === "supplier" ? "suppliers" : "purchases"}
            showPageSizeSelector
          />
        </div>

        <PurchaseDetailPanel
          purchaseId={activePurchaseId}
          locations={locations}
        />
      </div>
    </main>
  )
}
