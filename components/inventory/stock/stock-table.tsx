"use client"

import { RecordHoverCard } from "@/components/shared/record-hover-card"
import * as React from "react"

import type { getInventoryStock } from "@/lib/actions/inventory/stock-actions"

import { DataTablePagination } from "@/components/shared/data-table-pagination"
import { SortableTableHead } from "@/components/shared/sortable-table-head"
import { cn } from "@/lib/utils"

// Derived from the actual server action's return shape (rather than
// hand-declared) so this table never drifts out of sync with whatever
// fields getInventoryStock happens to select/spread.
type StockRow = Awaited<ReturnType<typeof getInventoryStock>>["stockItems"][number]

type Pagination = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

type StockTableProps = {
  stockItems: StockRow[]
  pagination: Pagination
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  /** Which row's detail is showing in the panel alongside this table — distinct from selectedIds, which is the bulk-action checkbox selection. */
  activeStockId?: string | null
  onActivate?: (id: string) => void
}

function formatNumber(value: number | string | null | undefined, digits = 3) {
  if (value === null || value === undefined || value === "") return "-"
  return Number(value).toFixed(digits)
}

export function StockTable({
  stockItems,
  pagination,
  selectedIds,
  onSelectionChange,
  activeStockId,
  onActivate,
}: StockTableProps) {
  const allIds = React.useMemo(
    () => stockItems.map((item) => item.id),
    [stockItems]
  )

  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.includes(id))

  const someSelected =
    allIds.some((id) => selectedIds.includes(id)) && !allSelected

  const headerCheckboxRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  const toggleAll = (checked: boolean) => {
    if (checked) {
      const merged = Array.from(new Set([...selectedIds, ...allIds]))
      onSelectionChange(merged)
      return
    }

    onSelectionChange(selectedIds.filter((id) => !allIds.includes(id)))
  }

  const toggleOne = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange(Array.from(new Set([...selectedIds, id])))
      return
    }

    onSelectionChange(selectedIds.filter((selectedId) => selectedId !== id))
  }

  if (!stockItems.length) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No inventory stock found yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="w-12 px-4 py-3">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => toggleAll(e.target.checked)}
                  aria-label="Select all stock items"
                  className="h-4 w-4 rounded border-input"
                />
              </th>
              <SortableTableHead label="Stock Code" sortKey="stockCode" defaultSortBy="createdAt" />
              <SortableTableHead label="Title" sortKey="product" defaultSortBy="createdAt" />
            </tr>
          </thead>

          <tbody>
            {stockItems.map((item) => {
              const checked = selectedIds.includes(item.id)
              const isActive = activeStockId === item.id

              return (
                <tr
                  key={item.id}
                  onClick={() => onActivate?.(item.id)}
                  className={cn(
                    "border-b last:border-0",
                    onActivate && "cursor-pointer hover:bg-accent/50",
                    isActive && "bg-accent",
                  )}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleOne(item.id, e.target.checked)}
                      aria-label={`Select ${item.stockCode}`}
                      className="h-4 w-4 rounded border-input"
                    />
                  </td>

                  <td className="px-4 py-3 text-foreground">{item.stockCode}</td>

                  <td className="px-4 py-3 font-medium">
                    <RecordHoverCard
                      label={item.product?.name ?? item.stockCode}
                      href={onActivate ? undefined : `/inventory/stock/${item.id}`}
                      title={item.product?.name ?? item.stockCode}
                      subtitle={item.stockCode}
                      footerLabel="View stock item"
                      sections={[
                        {
                          fields: [
                            { label: "Tag", value: item.tagNumber },
                            { label: "Metal", value: item.metalType?.name },
                            { label: "Purity", value: item.purity },
                          ],
                        },
                        {
                          fields: [
                            { label: "Gross", value: formatNumber(item.grossWeight) },
                            { label: "Net", value: formatNumber(item.netWeight) },
                          ],
                        },
                        {
                          fields: [
                            { label: "Quantity", value: item.quantity },
                            { label: "Location", value: item.location?.name },
                          ],
                        },
                      ]}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <DataTablePagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalCount={pagination.totalCount}
        totalPages={pagination.totalPages}
        itemLabel="stock items"
      />
    </div>
  )
}
