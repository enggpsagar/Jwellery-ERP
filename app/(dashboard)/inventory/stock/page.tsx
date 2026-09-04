import type { Metadata } from "next";

import { getInventoryStock, type StockSortBy } from "@/lib/actions/inventory/stock-actions";

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

  const { stockItems, pagination } = await getInventoryStock({
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
  })

  return <StockClient stockItems={stockItems} pagination={pagination} />;
}
