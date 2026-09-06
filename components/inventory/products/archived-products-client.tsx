"use client"

import * as React from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

import { PageBackHeader } from "@/components/shared/page-back-header"
import { Input } from "@/components/ui/input"
import { ProductsTable } from "@/components/inventory/products/products-table"
import { ArchivedProductDetailPanel } from "@/components/inventory/products/archived-product-detail-panel"

type ProductRow = React.ComponentProps<typeof ProductsTable>["products"][number]

type Pagination = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

type ArchivedProductsClientProps = {
  products: ProductRow[]
  pagination: Pagination
  canEdit?: boolean
}

/**
 * Same master-detail layout as the active Products page (search/paginated
 * list on the left, full detail on the right), matching the same treatment
 * already given to Archived Customers/Vendors and Disabled Artisans.
 */
export function ArchivedProductsClient({
  products,
  pagination,
  canEdit = false,
}: ArchivedProductsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = React.useState(searchParams.get("search") ?? "")
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
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

  function updateSearch(value: string) {
    setSearch(value)
    const params = new URLSearchParams(searchParams.toString())
    if (value.trim()) params.set("search", value.trim())
    else params.delete("search")
    params.set("page", "1")
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Archived Products"
        description="Products removed from the active catalogue. Reactivating one makes it available in Products again."
        backHref="/inventory/products"
        backLabel="Back to Products"
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          <div className="max-w-sm">
            <Input
              placeholder="Search archived products..."
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
            />
          </div>

          <ProductsTable
            products={products}
            pagination={pagination}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            activeProductId={activeProductId}
            onActivate={setActiveProductId}
          />
        </div>

        <ArchivedProductDetailPanel productId={activeProductId} canEdit={canEdit} />
      </div>
    </main>
  )
}
