import type { Metadata } from "next"
import { InvoiceStatus } from "@prisma/client"

import { getPurchases } from "@/lib/actions/purchase-actions"
import { getStoreLocations } from "@/lib/actions/store-location-actions"
import { PurchasesClient } from "@/components/purchases/purchases-client"

export const metadata: Metadata = {
  title: "Purchases",
}

type PurchasesPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: "purchaseDate" | "purchaseNumber" | "totalAmount"
    sortOrder?: "asc" | "desc"
    status?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function PurchasesPage({ searchParams }: PurchasesPageProps) {
  const params = (await searchParams) ?? {}

  const page = Number(params.page || 1)
  const pageSize = Number(params.pageSize || 10)
  const search = params.search || ""
  const sortBy = params.sortBy || "purchaseDate"
  const sortOrder = params.sortOrder || "desc"
  const isValidStatus = (Object.values(InvoiceStatus) as string[]).includes(params.status ?? "")
  const status = isValidStatus ? (params.status as InvoiceStatus) : "ALL"

  const [{ purchases, pagination }, locations] = await Promise.all([
    getPurchases({ page, pageSize, search, sortBy, sortOrder, status }),
    getStoreLocations(),
  ])

  return (
    <PurchasesClient purchases={purchases} locations={locations} pagination={pagination} />
  )
}
