import { getCustomers } from "@/lib/actions/customer-actions"
import { getStates } from "@/lib/actions/location-actions"
import { CustomersClient } from "@/components/customers/customers-client"

type CustomersPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: "name" | "createdAt" | "openingBalance"
    sortOrder?: "asc" | "desc"
  }>
}

export const dynamic = "force-dynamic"

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  const params = (await searchParams) ?? {}

  const page = Number(params.page || 1)
  const pageSize = Number(params.pageSize || 10)
  const search = params.search || ""
  const sortBy = params.sortBy || "createdAt"
  const sortOrder = params.sortOrder || "desc"

  const [{ customers, pagination }, states] = await Promise.all([
    getCustomers({ page, pageSize, search, sortBy, sortOrder }),
    getStates(),
  ])

  return (
    <CustomersClient
      customers={customers}
      states={states}
      pagination={pagination}
    />
  )
}