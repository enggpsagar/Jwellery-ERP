import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getVendors, type VendorSortBy } from "@/lib/actions/vendor-actions"
import { getStates } from "@/lib/actions/location-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { VendorsClient } from "@/components/vendors/vendors-client"

export const metadata: Metadata = {
  title: "Vendors",
}

type VendorsPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: VendorSortBy
    sortOrder?: "asc" | "desc"
    dateFrom?: string
    dateTo?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function VendorsPage({
  searchParams,
}: VendorsPageProps) {
  const params = (await searchParams) ?? {}

  // Module toggled off in Settings — the sidebar already hides the entry
  // point, this stops anyone reaching it directly by URL too.
  const businessSettings = await getBusinessSettings()
  if (!businessSettings.vendorsModuleEnabled) {
    redirect("/dashboard")
  }

  const page = Number(params.page || 1)
  const pageSize = Number(params.pageSize || 10)
  const search = params.search || ""
  const sortBy = params.sortBy || "createdAt"
  const sortOrder = params.sortOrder || "desc"
  const dateFrom = params.dateFrom || undefined
  const dateTo = params.dateTo || undefined

  const [{ vendors, pagination }, states] = await Promise.all([
    getVendors({ page, pageSize, search, sortBy, sortOrder, dateFrom, dateTo }),
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
