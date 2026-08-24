import Link from "next/link"

import { getKachaInvoices, type KachaInvoiceSortField } from "@/lib/actions/kacha-invoice-actions"
import { KachaInvoiceTable } from "@/components/billing/kacha/kacha-invoice-table"
import { KachaInvoicesToolbar } from "@/components/billing/kacha/kacha-invoices-toolbar"
import { DataTablePagination } from "@/components/shared/data-table-pagination"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"

type KachaBillingPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: KachaInvoiceSortField
    sortOrder?: "asc" | "desc"
    status?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function KachaBillingPage({ searchParams }: KachaBillingPageProps) {
  const params = (await searchParams) ?? {}

  const page = Number(params.page || 1)
  const pageSize = Number(params.pageSize || 10)
  const search = params.search || ""
  const sortBy = params.sortBy || "invoiceDate"
  const sortOrder = params.sortOrder || "desc"
  const status = params.status || "ALL"

  const { kachaInvoices, pagination } = await getKachaInvoices({
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    status,
  })

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Kacha Slips"
        description="Informal, no-GST sale slips — convert to a Pakka invoice once paperwork is ready."
        backHref="/billing"
        backLabel="Back to Billing"
        action={
          <Link href="/billing/kacha/new">
            <Button>New Kacha Slip</Button>
          </Link>
        }
      />

      <KachaInvoicesToolbar />

      <KachaInvoiceTable kachaInvoices={kachaInvoices} />

      {kachaInvoices.length > 0 ? (
        <DataTablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalCount={pagination.totalCount}
          pageSize={pagination.pageSize}
          itemLabel="kacha slips"
        />
      ) : null}
    </main>
  )
}
