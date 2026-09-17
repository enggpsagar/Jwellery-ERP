import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getCustomers } from "@/lib/actions/customer-actions"
import { getStates } from "@/lib/actions/location-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { CustomersClient } from "@/components/customers/customers-client"

export const metadata: Metadata = {
  title: "Suppliers",
}

type SuppliersPageProps = {
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

/**
 * A filtered view of the same Customer/Party list (isSupplier: true) —
 * reuses CustomersClient wholesale rather than forking a near-identical
 * component tree, same underlying table/data as /customers. Gated on
 * BusinessSettings.supplierModuleEnabled, same "module off -> route
 * unreachable" precedent the old standalone Vendors module used.
 */
export default async function SuppliersPage({ searchParams }: SuppliersPageProps) {
  const businessSettings = await getBusinessSettings()
  if (!businessSettings.supplierModuleEnabled) {
    redirect("/dashboard")
  }

  const params = (await searchParams) ?? {}

  const page = Number(params.page || 1)
  const pageSize = Number(params.pageSize || 10)
  const search = params.search || ""
  const sortBy = params.sortBy || "createdAt"
  const sortOrder = params.sortOrder || "desc"
  const dateFrom = params.dateFrom || undefined
  const dateTo = params.dateTo || undefined

  const [{ customers, pagination }, states] = await Promise.all([
    getCustomers({ page, pageSize, search, sortBy, sortOrder, dateFrom, dateTo, supplierOnly: true }),
    getStates(),
  ])

  return (
    <CustomersClient
      customers={customers}
      states={states}
      pagination={pagination}
      supplierModuleEnabled
      title="Suppliers"
      itemLabelSingular="supplier"
      itemLabelPlural="suppliers"
      addLabel="Add Supplier"
      addHref="/customers/new?returnTo=%2Fsuppliers&markAsSupplier=1"
      archivedHref="/customers/archived"
      archivedLabel="All Parties"
      showImport={false}
    />
  )
}
