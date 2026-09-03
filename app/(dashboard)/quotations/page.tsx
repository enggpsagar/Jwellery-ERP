import type { Metadata } from "next"
import Link from "next/link"

import { getQuotations } from "@/lib/actions/quotation-actions"
import { QuotationTable } from "@/components/quotations/quotation-table"
import { QuotationsToolbar } from "@/components/quotations/quotations-toolbar"
import { DataTablePagination } from "@/components/shared/data-table-pagination"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Quotations",
}

type QuotationsPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: "quotationDate" | "quotationNumber" | "totalAmount"
    sortOrder?: "asc" | "desc"
    status?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function QuotationsPage({ searchParams }: QuotationsPageProps) {
  const params = (await searchParams) ?? {}

  const page = Number(params.page || 1)
  const pageSize = Number(params.pageSize || 10)
  const search = params.search || ""
  const sortBy = params.sortBy || "quotationDate"
  const sortOrder = params.sortOrder || "desc"
  const status = params.status || "ALL"

  const { quotations, pagination } = await getQuotations({
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
        title="Quotations"
        description="Create and track price quotations for customers."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        action={
          <Link href="/quotations/new">
            <Button>New Quotation</Button>
          </Link>
        }
      />

      <QuotationsToolbar />

      <div>
        <QuotationTable quotations={quotations} />
        <DataTablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalCount={pagination.totalCount}
          pageSize={pagination.pageSize}
          itemLabel="quotations"
        />
      </div>
    </main>
  )
}
