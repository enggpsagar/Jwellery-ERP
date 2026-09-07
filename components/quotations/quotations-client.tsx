"use client"

import { useEffect, useState } from "react"

import { QuotationTable } from "@/components/quotations/quotation-table"
import { QuotationsToolbar } from "@/components/quotations/quotations-toolbar"
import { DataTablePagination } from "@/components/shared/data-table-pagination"
import { BulkDeleteButton } from "@/components/shared/bulk-delete-button"
import { bulkDeleteQuotations } from "@/lib/actions/quotation-actions"

type QuotationRow = {
  id: string
  quotationNumber: string
  quotationDate: string
  validUntil: string | null
  status: string
  totalAmount: number
  customer: { id: string; name: string; phone: string | null } | null
  convertedTo: { id: string; invoiceNumber: string } | null
}

type Pagination = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

type QuotationsClientProps = {
  quotations: QuotationRow[]
  pagination: Pagination
}

export function QuotationsClient({ quotations, pagination }: QuotationsClientProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Selection is only ever meaningful for the rows currently on screen — a
  // new page/search/filter result must not carry over stale ticked ids.
  useEffect(() => {
    setSelectedIds([])
  }, [quotations])

  return (
    <div className="space-y-4">
      <QuotationsToolbar
        selectedIds={selectedIds}
        bulkActions={
          <BulkDeleteButton
            selectedIds={selectedIds}
            itemLabelSingular="quotation"
            itemLabelPlural="quotations"
            getDisplayName={(id) =>
              quotations.find((quotation) => quotation.id === id)?.quotationNumber ?? id
            }
            onDelete={bulkDeleteQuotations}
            onDone={() => setSelectedIds([])}
          />
        }
      />

      <div>
        <QuotationTable
          quotations={quotations}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
        <DataTablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalCount={pagination.totalCount}
          pageSize={pagination.pageSize}
          itemLabel="quotations"
        />
      </div>
    </div>
  )
}
