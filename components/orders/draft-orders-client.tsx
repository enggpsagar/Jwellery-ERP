"use client"

import * as React from "react"

import { DraftOrdersTable } from "@/components/orders/draft-orders-table"
import { DataTableToolbar } from "@/components/shared/data-table-toolbar"
import { DataTablePagination } from "@/components/shared/data-table-pagination"
import { BulkDeleteButton } from "@/components/shared/bulk-delete-button"
import {
  exportDraftOrdersToExcel,
  bulkDeleteDraftOrders,
  type DraftOrderRow,
} from "@/lib/actions/draft-order-actions"

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "SENT_TO_KARIGAR", label: "Sent to Artisan" },
  { value: "RECEIVED", label: "Received" },
  { value: "CANCELLED", label: "Cancelled" },
]

const SORT_OPTIONS = [
  { value: "orderDate", label: "Sort by Date" },
  { value: "orderNumber", label: "Sort by Order #" },
]

type Pagination = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

type DraftOrdersClientProps = {
  orders: DraftOrderRow[]
  pagination: Pagination
}

export function DraftOrdersClient({ orders, pagination }: DraftOrdersClientProps) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])

  React.useEffect(() => {
    setSelectedIds([])
  }, [orders])

  return (
    <div className="space-y-3">
      <DataTableToolbar
        searchPlaceholder="Search by order number, customer..."
        sortOptions={SORT_OPTIONS}
        defaultSortBy="orderDate"
        statusOptions={STATUS_OPTIONS}
        selectedIds={selectedIds}
        entityLabel="draft orders"
        exportAction={exportDraftOrdersToExcel}
        bulkActions={
          <BulkDeleteButton
            selectedIds={selectedIds}
            itemLabelSingular="draft order"
            itemLabelPlural="draft orders"
            getDisplayName={(id) => orders.find((order) => order.id === id)?.orderNumber ?? id}
            onDelete={bulkDeleteDraftOrders}
            onDone={() => setSelectedIds([])}
          />
        }
      />

      <DraftOrdersTable orders={orders} selectedIds={selectedIds} onSelectionChange={setSelectedIds} />

      <div className="rounded-b-xl border">
        <DataTablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalCount={pagination.totalCount}
          pageSize={pagination.pageSize}
          itemLabel="draft orders"
        />
      </div>
    </div>
  )
}
