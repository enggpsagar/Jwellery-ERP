import type { Metadata } from "next"
import { InvoiceStatus } from "@prisma/client"

import { getPurchases, getPurchasesBySupplier } from "@/lib/actions/purchase-actions"
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
    dateFrom?: string
    dateTo?: string
    /** "bills" = flat list; anything else = grouped by supplier (default). */
    view?: string
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
  const dateFrom = params.dateFrom || undefined
  const dateTo = params.dateTo || undefined

  const view = params.view === "bills" ? "bills" : "supplier"
  const filters: NonNullable<Parameters<typeof getPurchases>[0]> = { page, pageSize, search, sortBy, sortOrder, status, dateFrom, dateTo }

  const [listing, locations] = await Promise.all([
    view === "bills"
      ? getPurchases(filters).then((result) => ({ ...result, groups: null }))
      : getPurchasesBySupplier(filters).then((result) => ({
          purchases: result.groups.flatMap((group) => group.purchases),
          groups: result.groups,
          pagination: result.pagination,
        })),
    getStoreLocations(),
  ])

  return (
    <PurchasesClient
      purchases={listing.purchases}
      groups={listing.groups}
      view={view}
      locations={locations}
      pagination={listing.pagination}
    />
  )
}
