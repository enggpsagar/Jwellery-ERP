"use client"

import * as React from "react"
import Link from "next/link"

import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"
import { DataTableToolbar } from "@/components/shared/data-table-toolbar"
import { ProductsTable } from "@/components/inventory/products/products-table"
import { exportProductsToExcel } from "@/lib/actions/inventory/product-actions"

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
}

export function ProductsClient({
  products,
  pagination,
  canCreate = false,
  canEdit = false,
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
        ]}
        defaultSortBy="createdAt"
        selectedIds={selectedIds}
        entityLabel="products"
        exportAction={exportProductsToExcel}
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
