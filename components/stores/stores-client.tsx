"use client"

import { Gem } from "lucide-react"

import { StoreTable } from "@/components/stores/store-table"
import { StoreFormDialog } from "@/components/stores/store-form-dialog"
import { DataTableToolbar } from "@/components/shared/data-table-toolbar"
import { DataTablePagination } from "@/components/shared/data-table-pagination"
import { exportStoresToExcel } from "@/lib/actions/store-actions"
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
}

function formatGrams(value: number) {
  return `${value.toLocaleString("en-IN", { maximumFractionDigits: 3 })} g`
}

export function StoresClient({ stores, pagination, goldSummary }: StoresClientProps) {
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

        <StoreFormDialog />
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

      <DataTableToolbar
        searchPlaceholder="Search by store name, code, or city..."
        sortOptions={[
          { value: "createdAt", label: "Sort by Created Date" },
          { value: "name", label: "Sort by Name" },
          { value: "code", label: "Sort by Code" },
        ]}
        defaultSortBy="createdAt"
        entityLabel="stores"
        exportAction={exportStoresToExcel}
      />

      <div className="space-y-3">
        <StoreTable stores={stores} />

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
    </div>
  )
}
