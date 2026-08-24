import Link from "next/link"

import { getInvoices, type InvoiceSortField } from "@/lib/actions/invoice-actions"
import { InvoiceTable } from "@/components/billing/invoice-table"
import { InvoicesToolbar } from "@/components/billing/invoices-toolbar"
import { DataTablePagination } from "@/components/shared/data-table-pagination"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"

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

  const { invoices, pagination } = await getInvoices({
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
        title="Billing"
        description="Create and track customer invoices."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        action={
          <div className="flex items-center gap-2">
            <Link href="/billing/kacha">
              <Button variant="outline">Kacha Slips</Button>
            </Link>

            <Link href="/billing/new">
              <Button>New Invoice</Button>
            </Link>
          </div>
        }
      />

      <InvoicesToolbar />

      <InvoiceTable invoices={invoices} />

      {invoices.length > 0 ? (
        <DataTablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalCount={pagination.totalCount}
          pageSize={pagination.pageSize}
          itemLabel="invoices"
        />
      ) : null}
    </main>
  )
}
