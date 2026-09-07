"use client"

import * as React from "react"

import { DraftOrdersTable } from "@/components/orders/draft-orders-table"
import { DraftOrderDetailPanel } from "@/components/orders/draft-order-detail-panel"
import { DataTableToolbar } from "@/components/shared/data-table-toolbar"
import { DataTablePagination } from "@/components/shared/data-table-pagination"
import { BulkDeleteButton } from "@/components/shared/bulk-delete-button"
import type { KarigarOption } from "@/components/karigars/karigar-select"
import type { LocationOption } from "@/components/shared/location-select"
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
  karigars: KarigarOption[]
  locations: LocationOption[]
  defaultLocationId: string | null
}

/**
 * Master-detail layout for Draft Orders — search/sort/paginated list on
 * the left, full detail (order info, requested items, actions) on the
 * right, same treatment already given to Customers/Vendors/Purchases/
 * Billing/Quotations.
 */
export function DraftOrdersClient({
  orders,
  pagination,
  karigars,
  locations,
  defaultLocationId,
}: DraftOrdersClientProps) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  // Defaults to the first row on load so the panel is never empty —
  // matching every other master-detail list in the app.
  const [activeOrderId, setActiveOrderId] = React.useState<string | null>(orders[0]?.id ?? null)

  React.useEffect(() => {
    setSelectedIds([])
    setActiveOrderId((current) => {
      if (current && orders.some((order) => order.id === current)) return current
      return orders[0]?.id ?? null
    })
  }, [orders])

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
      <div className="space-y-3">
        <DataTableToolbar
          searchPlaceholder="Search by order number, customer..."
          sortOptions={SORT_OPTIONS}
          defaultSortBy="orderDate"
          hideSort
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

        <DraftOrdersTable
          orders={orders}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          activeOrderId={activeOrderId}
          onActivate={setActiveOrderId}
        />

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

      <DraftOrderDetailPanel
        orderId={activeOrderId}
        karigars={karigars}
        locations={locations}
        defaultLocationId={defaultLocationId}
      />
    </div>
  )
}
