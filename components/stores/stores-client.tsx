"use client"

import * as React from "react"
import Link from "next/link"
import { Gem, Plus } from "lucide-react"

import { StoreTable } from "@/components/stores/store-table"
import { StoreDetailPanel } from "@/components/stores/store-detail-panel"
import { DataTableToolbar } from "@/components/shared/data-table-toolbar"
import { DataTablePagination } from "@/components/shared/data-table-pagination"
import { BulkArchiveButton } from "@/components/shared/bulk-archive-button"
import { exportStoresToExcel, bulkArchiveStores } from "@/lib/actions/store-actions"
import type { PlanRow } from "@/lib/actions/plan-actions"
import type { StorePlanOverview } from "@/lib/actions/store-plan-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

type StoreRow = {
  id: string
  name: string
  code: string
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  phone: string | null
  email: string | null
  gstNumber: string | null
  isActive: boolean
  createdAt: Date
  plan: { id: string; name: string; durationDays: number } | null
  planExpiresAt: Date | null
  _count: { users: number; customers: number; invoices: number }
}

type Pagination = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

type GoldSummary = {
  totalGoldWeight: number
  byStore: { storeId: string; storeName: string; storeCode: string; goldWeight: number }[]
}

type StoresClientProps = {
  stores: StoreRow[]
  pagination: Pagination
  goldSummary: GoldSummary
  plans: PlanRow[]
  planOverviews: Record<string, StorePlanOverview>
}

function formatGrams(value: number) {
  return `${value.toLocaleString("en-IN", { maximumFractionDigits: 3 })} g`
}

export function StoresClient({
  stores,
  pagination,
  goldSummary,
  plans,
  planOverviews,
}: StoresClientProps) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  // Which row's full detail shows in the right-hand panel — defaults to
  // the first row on this page/search result so the panel is never empty
  // on load, matching the Customers/Vendors/Karigars/Users layout this
  // mirrors.
  const [activeStoreId, setActiveStoreId] = React.useState<string | null>(
    stores[0]?.id ?? null,
  )

  React.useEffect(() => {
    setSelectedIds([])
    setActiveStoreId((current) => {
      if (current && stores.some((store) => store.id === current)) return current
      return stores[0]?.id ?? null
    })
  }, [stores])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Stores</h1>
          <p className="text-muted-foreground">
            Create stores and their admins. Use the store switcher in the
            top bar to manage a store&apos;s data.
          </p>
        </div>

        <Button asChild className="gap-2">
          <Link href="/stores/new">
            <Plus className="h-4 w-4" />
            Add Store
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gem className="h-5 w-5 text-amber-500" />
              Gold Available — All Stores
            </CardTitle>
            <CardDescription>
              Physical gold currently in stock, summed across every store.
            </CardDescription>
          </div>

          <span className="text-2xl font-bold tabular-nums">
            {formatGrams(goldSummary.totalGoldWeight)}
          </span>
        </CardHeader>

        {goldSummary.byStore.length > 0 && (
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {goldSummary.byStore.map((s) => (
                <div key={s.storeId} className="rounded-lg border p-3">
                  <p className="truncate text-xs font-medium text-muted-foreground">
                    {s.storeName}
                  </p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">
                    {formatGrams(s.goldWeight)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Toolbar lives inside the table's own column (not spanning the
          detail panel too) — it filters/sorts/exports the table, so it
          belongs with the table, not the whole page. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-3">
          <DataTableToolbar
            searchPlaceholder="Search by store name, code, or city..."
            sortOptions={[
              { value: "createdAt", label: "Sort by Created Date" },
              { value: "name", label: "Sort by Name" },
              { value: "code", label: "Sort by Code" },
            ]}
            defaultSortBy="createdAt"
            selectedIds={selectedIds}
            entityLabel="stores"
            exportAction={exportStoresToExcel}
            bulkActions={
              <BulkArchiveButton
                selectedIds={selectedIds}
                itemLabelSingular="store"
                itemLabelPlural="stores"
                getDisplayName={(id) => stores.find((store) => store.id === id)?.name ?? id}
                onArchive={bulkArchiveStores}
                onDone={() => setSelectedIds([])}
              />
            }
          />

          <StoreTable
            stores={stores}
            plans={plans}
            planOverviews={planOverviews}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            activeStoreId={activeStoreId}
            onActivate={setActiveStoreId}
          />

          <div className="rounded-xl border">
            <DataTablePagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalCount={pagination.totalCount}
              pageSize={pagination.pageSize}
              itemLabel="stores"
            />
          </div>
        </div>

        <StoreDetailPanel storeId={activeStoreId} />
      </div>
    </div>
  )
}
