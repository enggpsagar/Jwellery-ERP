import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getVendors } from "@/lib/actions/vendor-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { ArchivedVendorsClient } from "@/components/vendors/archived-vendors-client"

export const metadata: Metadata = {
  title: "Archived Vendors",
}

type ArchivedVendorsPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: "name" | "createdAt" | "openingBalance"
    sortOrder?: "asc" | "desc"
  }>
}

export const dynamic = "force-dynamic"

export default async function ArchivedVendorsPage({
  searchParams,
}: ArchivedVendorsPageProps) {
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

  const { vendors, pagination } = await getVendors({
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    archived: true,
  })

  return <ArchivedVendorsClient vendors={vendors} pagination={pagination} />
}
