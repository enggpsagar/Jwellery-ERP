"use client"

import * as React from "react"
import Link from "next/link"

import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"
import { DataTableToolbar } from "@/components/shared/data-table-toolbar"
import { BulkDeleteButton } from "@/components/shared/bulk-delete-button"
import { ProductsTable } from "@/components/inventory/products/products-table"
import { ProductDetailPanel } from "@/components/inventory/products/product-detail-panel"
import { ProductImportDialog } from "@/components/inventory/products/product-import-dialog"
import {
  exportProductsToExcel,
  bulkDeleteProducts,
} from "@/lib/actions/inventory/product-actions"
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions"
import { UNASSIGNED_METAL_TYPE } from "@/lib/business-units"

type ProductRow = React.ComponentProps<typeof ProductsTable>["products"][number]

type Pagination = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

type ProductsClientProps = {
  products: ProductRow[]
  pagination: Pagination
  /** PRODUCT_CREATE — resolved on the server; the route enforces it too. */
  canCreate?: boolean
  /** PRODUCT_UPDATE — hides per-row edit for view-only users. */
  canEdit?: boolean
  /** The store's own configured metals/stones (Settings > Taxonomy) — the
   * Type filter's options come directly from this list, so a metal added
   * there shows up here with no code change. */
  metals?: StoreMetalRow[]
}

export function ProductsClient({
  products,
  pagination,
  canCreate = false,
  canEdit = false,
  metals = [],
}: ProductsClientProps) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  // Which row's full detail shows in the right-hand panel — defaults to
  // the first row on this page/search result so the panel is never empty
  // on load, matching the Customers master-detail layout this mirrors.
  const [activeProductId, setActiveProductId] = React.useState<string | null>(
    products[0]?.id ?? null,
  )

  React.useEffect(() => {
    setSelectedIds([])
    setActiveProductId((current) => {
      if (current && products.some((product) => product.id === current)) return current
      return products[0]?.id ?? null
    })
  }, [products])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Products"
        description="Manage jewellery product masters."
        backHref="/inventory"
        backLabel="Back to Inventory"
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/inventory/products/archived">
              <Button variant="outline">Archived Products</Button>
            </Link>
            {canCreate ? <ProductImportDialog /> : null}
            {canCreate ? (
              <Link href="/inventory/products/new">
                <Button>Add Product</Button>
              </Link>
            ) : null}
          </div>
        }
      />

      {/* List + detail side by side, matching the Customers master-detail
          layout — stacks on narrow viewports since there's no room for
          both. The toolbar lives inside the table's own column (not
          spanning the detail panel too) — it filters/sorts/exports the
          table, so it belongs with the table, not the whole page. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          <DataTableToolbar
            searchPlaceholder="Search by name, product code, design code..."
            sortOptions={[
              { value: "name", label: "Sort by Name" },
              { value: "productCode", label: "Sort by Product Code" },
              { value: "createdAt", label: "Sort by Created Date" },
              { value: "category", label: "Sort by Category" },
              { value: "categoryType", label: "Sort by Type" },
              { value: "metalType", label: "Sort by Metal" },
              { value: "defaultPurity", label: "Sort by Purity" },
              { value: "defaultNetWeight", label: "Sort by Net Weight" },
              { value: "isActive", label: "Sort by Status" },
            ]}
            defaultSortBy="createdAt"
            hideSort
            selectedIds={selectedIds}
            entityLabel="products"
            exportAction={exportProductsToExcel}
            statusOptions={[
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
            ]}
            typeOptions={[
              ...metals
                .filter((metal) => metal.isActive)
                .map((metal) => ({ value: metal.id, label: metal.name })),
              { value: UNASSIGNED_METAL_TYPE, label: "Unassigned" },
            ]}
            bulkActions={
              <BulkDeleteButton
                selectedIds={selectedIds}
                itemLabelSingular="product"
                itemLabelPlural="products"
                getDisplayName={(id) => products.find((product) => product.id === id)?.name ?? id}
                onDelete={bulkDeleteProducts}
                onDone={() => setSelectedIds([])}
              />
            }
          />

          <ProductsTable
            products={products}
            pagination={pagination}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            activeProductId={activeProductId}
            onActivate={setActiveProductId}
          />
        </div>

        <ProductDetailPanel productId={activeProductId} canEdit={canEdit} />
      </div>
    </main>
  )
}
