"use client"

import Link from "next/link"
import * as React from "react"

import type { InventoryStockStatus, InventoryFinish } from "@prisma/client"
import type { getInventoryStock } from "@/lib/actions/inventory/stock-actions"

import { StockStatusBadge } from "@/components/inventory/shared/stock-status-badge"
import { FinishBadge } from "@/components/inventory/shared/finish-badge"
import { DataTablePagination } from "@/components/shared/data-table-pagination"

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
}

function formatNumber(value: number | string | null | undefined, digits = 3) {
  if (value === null || value === undefined || value === "") return "-"
  return Number(value).toFixed(digits)
}

function formatAmount(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "-"
  return `₹${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("en-IN")
}

export function StockTable({
  stockItems,
  pagination,
  selectedIds,
  onSelectionChange,
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
      <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
        No inventory stock found yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
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
                  className="h-4 w-4 rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium">Stock Code</th>
              <th className="px-4 py-3 text-left font-medium">Product</th>
              <th className="px-4 py-3 text-left font-medium">Metal</th>
              <th className="px-4 py-3 text-left font-medium">Purity</th>
              <th className="px-4 py-3 text-left font-medium">Qty</th>
              <th className="px-4 py-3 text-left font-medium">Gross Wt.</th>
              <th className="px-4 py-3 text-left font-medium">Net Wt.</th>
              <th className="px-4 py-3 text-left font-medium">Making</th>
              <th className="px-4 py-3 text-left font-medium">Sale Amt.</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Finish</th>
              <th className="px-4 py-3 text-left font-medium">Location</th>
              <th className="px-4 py-3 text-left font-medium">Purchase Date</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
            </tr>
          </thead>

          <tbody>
            {stockItems.map((item) => {
              const checked = selectedIds.includes(item.id)

              return (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleOne(item.id, e.target.checked)}
                      aria-label={`Select ${item.stockCode}`}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </td>

                  <td className="px-4 py-3 font-medium">
                    <Link href={`/inventory/stock/${item.id}`} className="hover:underline">
                      {item.stockCode}
                    </Link>
                  </td>

                  <td className="px-4 py-3">
                    {item.product ? (
                      <Link
                        href={`/inventory/products/${item.product.id}?from=${encodeURIComponent("/inventory/stock")}`}
                        className="hover:underline"
                      >
                        <div className="font-medium text-primary">
                          {item.product.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.product.productCode}
                        </div>
                      </Link>
                    ) : (
                      <div className="font-medium">-</div>
                    )}
                  </td>

                  <td className="px-4 py-3">{item.metalType?.name ?? "-"}</td>
                  <td className="px-4 py-3">{item.purity ?? "-"}</td>
                  <td className="px-4 py-3">{item.quantity}</td>
                  <td className="px-4 py-3">{formatNumber(item.grossWeight)}</td>
                  <td className="px-4 py-3">{formatNumber(item.netWeight)}</td>
                  <td className="px-4 py-3">{formatAmount(item.makingCharge)}</td>
                  <td className="px-4 py-3">{formatAmount(item.saleAmount)}</td>

                  <td className="px-4 py-3">
                    <StockStatusBadge
                      status={item.status as InventoryStockStatus}
                      quantity={item.quantity}
                    />
                  </td>

                  <td className="px-4 py-3">
                    <FinishBadge finish={item.finish as InventoryFinish} />
                  </td>

                  <td className="px-4 py-3">{item.location?.name ?? "-"}</td>
                  <td className="px-4 py-3">{formatDate(item.purchaseDate)}</td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/inventory/stock/${item.id}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        View
                      </Link>

                      <Link
                        href={`/inventory/stock/${item.id}/edit`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        Edit
                      </Link>
                    </div>
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
