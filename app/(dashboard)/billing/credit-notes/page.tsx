import type { Metadata } from "next"

import { getCreditNotes, type CreditNoteSortBy } from "@/lib/actions/credit-note-actions"
import { CreditNotesClient } from "@/components/billing/credit-notes-client"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { DataTablePagination } from "@/components/shared/data-table-pagination"

export const metadata: Metadata = {
  title: "Credit Notes",
}

export const dynamic = "force-dynamic"

type CreditNotesPageProps = {
  searchParams?: Promise<{
    page?: string
    pageSize?: string
    search?: string
    sortBy?: CreditNoteSortBy
    sortOrder?: "asc" | "desc"
    dateFrom?: string
    dateTo?: string
  }>
}

export default async function CreditNotesPage({ searchParams }: CreditNotesPageProps) {
  const params = (await searchParams) ?? {}

  const { creditNotes, pagination } = await getCreditNotes({
    page: Number(params.page || 1),
    pageSize: Number(params.pageSize || 10),
    search: params.search || "",
    sortBy: params.sortBy || "creditNoteDate",
    sortOrder: params.sortOrder || "desc",
    dateFrom: params.dateFrom || undefined,
    dateTo: params.dateTo || undefined,
  })

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Credit Notes"
        description="Returns processed against paid invoices."
        backHref="/billing"
        backLabel="Back to Billing"
      />

      <CreditNotesClient creditNotes={creditNotes} />

      {creditNotes.length > 0 ? (
        <DataTablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalCount={pagination.totalCount}
          pageSize={pagination.pageSize}
          itemLabel="credit notes"
          showPageSizeSelector
        />
      ) : null}
    </main>
  )
}
