import type { Metadata } from "next"

import { getVendors } from "@/lib/actions/vendor-actions"
import { getStates } from "@/lib/actions/location-actions"
import { VendorsClient } from "@/components/vendors/vendors-client"

export const metadata: Metadata = {
  title: "Vendors",
}

type VendorsPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: "name" | "createdAt" | "openingBalance"
    sortOrder?: "asc" | "desc"
  }>
}

export const dynamic = "force-dynamic"

export default async function VendorsPage({
  searchParams,
}: VendorsPageProps) {
  const params = (await searchParams) ?? {}

  const page = Number(params.page || 1)
  const pageSize = Number(params.pageSize || 10)
  const search = params.search || ""
  const sortBy = params.sortBy || "createdAt"
  const sortOrder = params.sortOrder || "desc"

  const [{ vendors, pagination }, states] = await Promise.all([
    getVendors({ page, pageSize, search, sortBy, sortOrder }),
    getStates(),
  ])

  return (
    <VendorsClient
      vendors={vendors}
      states={states}
      pagination={pagination}
    />
  )
}
