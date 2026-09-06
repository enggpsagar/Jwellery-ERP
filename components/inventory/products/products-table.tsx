"use client"

import * as React from "react"

import { RecordHoverCard } from "@/components/shared/record-hover-card"
import { DataTablePagination } from "@/components/shared/data-table-pagination"
import { SortableTableHead } from "@/components/shared/sortable-table-head"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type ProductRow = {
  id: string
  productCode: string
  name: string
  category: string
  ornamentType: string | null
  metalType: string
  defaultPurity: string | null
  defaultNetWeight: number | null
  defaultGrossWeight: number | null
  defaultStoneWeight: number | null
  isActive: boolean
  createdAt: Date | string
}

type Pagination = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

type ProductsTableProps = {
  products: ProductRow[]
  pagination: Pagination
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  /** Which row's detail is showing in the panel alongside this table — distinct from selectedIds, which is the bulk-action checkbox selection. */
  activeProductId?: string | null
  onActivate?: (id: string) => void
}

export function ProductsTable({
  products,
  pagination,
  selectedIds,
  onSelectionChange,
  activeProductId,
  onActivate,
}: ProductsTableProps) {
  const allIds = React.useMemo(() => products.map((product) => product.id), [products])

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

  if (!products.length) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No products found yet.
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
                  aria-label="Select all products"
                  className="h-4 w-4 rounded border-input"
                />
              </th>
              <SortableTableHead label="Product Code" sortKey="productCode" defaultSortBy="createdAt" />
              <SortableTableHead label="Title" sortKey="name" defaultSortBy="createdAt" />
              <SortableTableHead label="Active" sortKey="isActive" defaultSortBy="createdAt" />
            </tr>
          </thead>

          <tbody>
            {products.map((product) => {
              const checked = selectedIds.includes(product.id)
              const isActive = activeProductId === product.id

              return (
                <tr
                  key={product.id}
                  onClick={() => onActivate?.(product.id)}
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
                      onChange={(e) => toggleOne(product.id, e.target.checked)}
                      aria-label={`Select ${product.name}`}
                      className="h-4 w-4 rounded border-input"
                    />
                  </td>

                  <td className="px-4 py-3 text-foreground">{product.productCode}</td>

                  <td className="px-4 py-3 font-medium text-foreground">
                    <RecordHoverCard
                      label={product.name}
                      href={onActivate ? undefined : `/inventory/products/${product.id}`}
                      title={product.name}
                      subtitle={product.productCode}
                      footerLabel="View product"
                      sections={[
                        {
                          fields: [
                            { label: "Category", value: product.category },
                            { label: "Type", value: product.ornamentType },
                            { label: "Metal", value: product.metalType },
                            { label: "Purity", value: product.defaultPurity },
                          ],
                        },
                        {
                          fields: [
                            {
                              label: "Gross weight",
                              value:
                                product.defaultGrossWeight != null
                                  ? `${product.defaultGrossWeight.toFixed(3)} g`
                                  : null,
                            },
                            {
                              label: "Net weight",
                              value:
                                product.defaultNetWeight != null
                                  ? `${product.defaultNetWeight.toFixed(3)} g`
                                  : null,
                            },
                            {
                              label: "Stone weight",
                              value:
                                product.defaultStoneWeight != null
                                  ? `${product.defaultStoneWeight.toFixed(3)} g`
                                  : null,
                            },
                          ],
                        },
                      ]}
                    />
                  </td>

                  <td className="px-4 py-3">
                    <Badge variant={product.isActive ? "default" : "secondary"}>
                      {product.isActive ? "Active" : "Inactive"}
                    </Badge>
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
        itemLabel="products"
      />
    </div>
  )
}
