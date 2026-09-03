import type { Metadata } from "next"

import { getVendors } from "@/lib/actions/vendor-actions"
import { ArchivedVendorsClient } from "@/components/vendors/archived-vendors-client"

export const metadata: Metadata = {
  title: "Archived Vendors",
}

type ArchivedVendorsPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function ArchivedVendorsPage({
  searchParams,
}: ArchivedVendorsPageProps) {
  const params = (await searchParams) ?? {}

  const page = Number(params.page || 1)
  const pageSize = Number(params.pageSize || 10)
  const search = params.search || ""

  const { vendors, pagination } = await getVendors({
    page,
    pageSize,
    search,
    archived: true,
  })

  return <ArchivedVendorsClient vendors={vendors} pagination={pagination} />
}
