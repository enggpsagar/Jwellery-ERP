import type { Metadata } from "next";

import {
  getInventoryStock,
  type StockSortBy,
} from "@/lib/actions/inventory/stock-actions";
import { getCategoryFilterOptions, getStoreMetals } from "@/lib/actions/taxonomy-actions";
import { getStoreLocations } from "@/lib/actions/store-location-actions";
import { UNASSIGNED_METAL_TYPE } from "@/lib/business-units";

import { StockClient } from "@/components/inventory/stock/stock-client";

export const metadata: Metadata = {
  title: "Stock",
};

type InventoryStockPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: StockSortBy
    sortOrder?: "asc" | "desc"
    type?: string
    /** "IN_STOCK" | "OOS" — the toolbar's In Stock/Out of Stock/Both filter. */
    status?: string
    dateFrom?: string
    dateTo?: string
    category?: string
    categoryType?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function InventoryStockPage({
  searchParams,
}: InventoryStockPageProps) {
  const params = (await searchParams) ?? {}

  const page = Number(params.page || 1)
  const pageSize = Number(params.pageSize || 10)
  const search = params.search || ""
  const sortBy = params.sortBy || "createdAt"
  const sortOrder = params.sortOrder || "desc"

  const [metals, locations, categoryFilter] = await Promise.all([
    getStoreMetals(),
    getStoreLocations(),
    getCategoryFilterOptions(),
  ])
  const validMetalTypeIds = new Set([...metals.map((m) => m.id), UNASSIGNED_METAL_TYPE])
  const metalTypeId = params.type && validMetalTypeIds.has(params.type) ? params.type : undefined
  const dateFrom = params.dateFrom || undefined
  const dateTo = params.dateTo || undefined
  // Only this store's own active Category/Type ids reach the query — and a
  // Type only counts when it belongs to the selected Category.
  // ...and, like the toolbar, only a Category offered for the chosen Metal
  // (untagged = every metal).
  const categoryId = categoryFilter.categories.some(
    (c) =>
      c.value === params.category &&
      (!metalTypeId || c.metalTagIds.length === 0 || c.metalTagIds.includes(metalTypeId)),
  )
    ? params.category
    : undefined
  const categoryTypeId =
    categoryId &&
    categoryFilter.categoryTypes.some((t) => t.value === params.categoryType && t.categoryId === categoryId)
      ? params.categoryType
      : undefined

  const { stockItems, pagination, totals } = await getInventoryStock({
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    metalTypeId,
    status: params.status,
    dateFrom,
    dateTo,
    categoryId,
    categoryTypeId,
  })

  return (
    <StockClient
      stockItems={stockItems}
      pagination={pagination}
      totals={totals}
      metals={metals}
      categoryFilter={categoryFilter}
      showLocation={locations.length > 1}
    />
  );
}
