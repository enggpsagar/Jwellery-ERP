"use client"

import * as React from "react"
import Link from "next/link"

import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"
import { DataTableToolbar } from "@/components/shared/data-table-toolbar"
import { BulkDeleteButton } from "@/components/shared/bulk-delete-button"
import { ProductsTable } from "@/components/inventory/products/products-table"
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

  React.useEffect(() => {
    setSelectedIds([])
  }, [products])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Products"
        description="Manage jewellery product masters."
        backHref="/inventory"
        backLabel="Back to Inventory"
        action={
          canCreate ? (
            <Link href="/inventory/products/new">
              <Button>Add Product</Button>
            </Link>
          ) : undefined
        }
      />

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
        selectedIds={selectedIds}
        entityLabel="products"
        exportAction={exportProductsToExcel}
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
        canEdit={canEdit}
        products={products}
        pagination={pagination}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />
    </main>
  )
}
