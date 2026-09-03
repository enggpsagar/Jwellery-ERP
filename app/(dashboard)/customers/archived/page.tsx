import type { Metadata } from "next"

import { getCustomers } from "@/lib/actions/customer-actions"
import { ArchivedCustomersClient } from "@/components/customers/archived-customers-client"

export const metadata: Metadata = {
  title: "Archived Customers",
}

type ArchivedCustomersPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function ArchivedCustomersPage({
  searchParams,
}: ArchivedCustomersPageProps) {
  const params = (await searchParams) ?? {}

  const page = Number(params.page || 1)
  const pageSize = Number(params.pageSize || 10)
  const search = params.search || ""

  const { customers, pagination } = await getCustomers({
    page,
    pageSize,
    search,
    archived: true,
  })

  return <ArchivedCustomersClient customers={customers} pagination={pagination} />
}
