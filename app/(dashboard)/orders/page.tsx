import type { Metadata } from "next"
import Link from "next/link"

import {
  getDraftOrders,
  type DraftOrderSortBy,
  type SortOrder,
} from "@/lib/actions/draft-order-actions"
import { getPaymentFormKarigars } from "@/lib/actions/payments-actions"
import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions"
import { DraftOrdersClient } from "@/components/orders/draft-orders-client"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Draft Orders",
}

export const dynamic = "force-dynamic"

type DraftOrdersPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: DraftOrderSortBy
    sortOrder?: SortOrder
    status?: string
  }>
}

export default async function DraftOrdersPage({ searchParams }: DraftOrdersPageProps) {
  const params = (await searchParams) ?? {}

  const page = Number(params.page || 1)
  const pageSize = Number(params.pageSize || 10)
  const search = params.search || ""
  const sortBy = params.sortBy || "orderDate"
  const sortOrder = params.sortOrder || "desc"
  const status = params.status || undefined

  const [{ orders, pagination }, karigars, locations, defaultLocationId] = await Promise.all([
    getDraftOrders({ page, pageSize, search, sortBy, sortOrder, status }),
    getPaymentFormKarigars(),
    getStoreLocations(),
    getDefaultLocationId(),
  ])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Draft Orders"
        description="Phone/counter orders — capture what a party wants, send it to an artisan, and it becomes real Product & Inventory once received."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        action={
          <Link href="/orders/new">
            <Button>New Draft Order</Button>
          </Link>
        }
      />

      <DraftOrdersClient
        orders={orders}
        pagination={pagination}
        karigars={karigars}
        locations={locations}
        defaultLocationId={defaultLocationId}
      />
    </main>
  )
}
