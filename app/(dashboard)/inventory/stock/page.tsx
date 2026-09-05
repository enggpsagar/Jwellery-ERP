import type { Metadata } from "next";

import {
  getInventoryStock,
  type StockSortBy,
} from "@/lib/actions/inventory/stock-actions";
import { getStoreMetals } from "@/lib/actions/taxonomy-actions";
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

  const metals = await getStoreMetals()
  const validMetalTypeIds = new Set([...metals.map((m) => m.id), UNASSIGNED_METAL_TYPE])
  const metalTypeId = params.type && validMetalTypeIds.has(params.type) ? params.type : undefined

  const { stockItems, pagination } = await getInventoryStock({
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    metalTypeId,
  })

  return <StockClient stockItems={stockItems} pagination={pagination} metals={metals} />;
}
