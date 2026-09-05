import type { Metadata } from "next";

import { getInventoryStock, type StockSortBy } from "@/lib/actions/inventory/stock-actions";
import type { PurityFamily } from "@/lib/business-units";

import { StockClient } from "@/components/inventory/stock/stock-client";

export const metadata: Metadata = {
  title: "Stock",
};

const VALID_METAL_FAMILIES: PurityFamily[] = [
  "GOLD",
  "SILVER",
  "PLATINUM",
  "DIAMOND",
  "STONE",
  "OTHER",
];

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
  const metalFamily = VALID_METAL_FAMILIES.includes(params.type as PurityFamily)
    ? (params.type as PurityFamily)
    : undefined

  const { stockItems, pagination } = await getInventoryStock({
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    metalFamily,
  })

  return <StockClient stockItems={stockItems} pagination={pagination} />;
}
