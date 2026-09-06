"use client"

import * as React from "react"
import Link from "next/link"

import { RecordHoverCard } from "@/components/shared/record-hover-card"
import { Eye, Pencil } from "lucide-react"

import { DeleteProductButton } from "@/components/inventory/products/delete-product-button"
import { DataTablePagination } from "@/components/shared/data-table-pagination"
import { SortableTableHead } from "@/components/shared/sortable-table-head"

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
  /** PRODUCT_UPDATE. Edit and delete are hidden without it; View stays, so a
   * view-only user still reaches the full read-only detail page. */
  canEdit?: boolean
}

export function ProductsTable({
  products,
  pagination,
  selectedIds,
  onSelectionChange,
  canEdit = false,
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
              <SortableTableHead label="Name" sortKey="name" defaultSortBy="createdAt" />
              <SortableTableHead label="Category" sortKey="category" defaultSortBy="createdAt" />
              <SortableTableHead label="Type" sortKey="categoryType" defaultSortBy="createdAt" />
              <SortableTableHead label="Metal" sortKey="metalType" defaultSortBy="createdAt" />
              <SortableTableHead label="Purity" sortKey="defaultPurity" defaultSortBy="createdAt" />
              <SortableTableHead
                label="Net Wt (g)"
                sortKey="defaultNetWeight"
                defaultSortBy="createdAt"
                align="right"
              />
              <SortableTableHead label="Status" sortKey="isActive" defaultSortBy="createdAt" />
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {products.map((product) => {
              const checked = selectedIds.includes(product.id)

              return (
                <tr key={product.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleOne(product.id, e.target.checked)}
                      aria-label={`Select ${product.name}`}
                      className="h-4 w-4 rounded border-input"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <RecordHoverCard
                      label={product.productCode}
                      href={`/inventory/products/${product.id}`}
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
                  <td className="px-4 py-3 font-medium">{product.name}</td>
                  <td className="px-4 py-3">{product.category}</td>
                  <td className="px-4 py-3">{product.ornamentType ?? "-"}</td>
                  <td className="px-4 py-3">{product.metalType}</td>
                  <td className="px-4 py-3">{product.defaultPurity ?? "-"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {product.defaultNetWeight != null
                      ? product.defaultNetWeight.toFixed(3)
                      : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        product.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {product.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/inventory/products/${product.id}`}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
                        title="View product"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>

                      {canEdit && (
                        <>
                          <Link
                            href={`/inventory/products/${product.id}/edit`}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-amber-700 hover:bg-amber-50"
                            title="Edit product"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>

                          <DeleteProductButton
                            productId={product.id}
                            productName={product.name}
                          />
                        </>
                      )}
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
        itemLabel="products"
      />
    </div>
  )
}
