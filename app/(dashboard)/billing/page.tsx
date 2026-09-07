import type { Metadata } from "next"

import { getInvoices, type InvoiceSortField } from "@/lib/actions/invoice-actions"
import { getStoreLocations } from "@/lib/actions/store-location-actions"
import { InvoicesClient } from "@/components/billing/invoices-client"

export const metadata: Metadata = {
  title: "Billing",
}

type BillingPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: InvoiceSortField
    sortOrder?: "asc" | "desc"
    status?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = (await searchParams) ?? {}

  const page = Number(params.page || 1)
  const pageSize = Number(params.pageSize || 10)
  const search = params.search || ""
  const sortBy = params.sortBy || "invoiceDate"
  const sortOrder = params.sortOrder || "desc"
  const status = params.status || "ALL"

  const [{ invoices, pagination }, locations] = await Promise.all([
    getInvoices({ page, pageSize, search, sortBy, sortOrder, status }),
    getStoreLocations(),
  ])

  return (
    <InvoicesClient invoices={invoices} locations={locations} pagination={pagination} />
  )
}
