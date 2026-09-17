import type { Metadata } from "next"

import { getCustomers } from "@/lib/actions/customer-actions"
import { getStates } from "@/lib/actions/location-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { CustomersClient } from "@/components/customers/customers-client"

export const metadata: Metadata = {
  title: "Parties",
}

type CustomersPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: "name" | "createdAt" | "openingBalance"
    sortOrder?: "asc" | "desc"
    dateFrom?: string
    dateTo?: string
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
  const dateFrom = params.dateFrom || undefined
  const dateTo = params.dateTo || undefined

  const [{ customers, pagination }, states, businessSettings] = await Promise.all([
    getCustomers({ page, pageSize, search, sortBy, sortOrder, dateFrom, dateTo }),
    getStates(),
    getBusinessSettings(),
  ])

  return (
    <CustomersClient
      customers={customers}
      states={states}
      pagination={pagination}
      supplierModuleEnabled={businessSettings.supplierModuleEnabled}
    />
  )
}