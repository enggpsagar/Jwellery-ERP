"use client"

import { StoreTable } from "@/components/stores/store-table"
import { StoreFormDialog } from "@/components/stores/store-form-dialog"
import { DataTableToolbar } from "@/components/shared/data-table-toolbar"
import { DataTablePagination } from "@/components/shared/data-table-pagination"
import { exportStoresToExcel } from "@/lib/actions/store-actions"

type StoreRow = {
  id: string
  name: string
  code: string
  city: string | null
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

type StoresClientProps = {
  stores: StoreRow[]
  pagination: Pagination
}

export function StoresClient({ stores, pagination }: StoresClientProps) {
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
