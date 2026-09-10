"use client"

import { useEffect, useState } from "react"

import { QuotationTable } from "@/components/quotations/quotation-table"
import { QuotationsToolbar } from "@/components/quotations/quotations-toolbar"
import { QuotationDetailPanel } from "@/components/quotations/quotation-detail-panel"
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

/**
 * Master-detail layout for Quotations — search/sort/paginated list on the
 * left, full detail (status, items, totals, actions) on the right, same
 * treatment already given to Customers/Vendors/Purchases/Billing.
 */
export function QuotationsClient({ quotations, pagination }: QuotationsClientProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Defaults to the first row on load so the panel is never empty —
  // matching CustomersClient/PurchasesClient/InvoicesClient.
  const [activeQuotationId, setActiveQuotationId] = useState<string | null>(
    quotations[0]?.id ?? null,
  )

  useEffect(() => {
    setSelectedIds([])
    setActiveQuotationId((current) => {
      if (current && quotations.some((quotation) => quotation.id === current)) return current
      return quotations[0]?.id ?? null
    })
  }, [quotations])

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
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
            activeQuotationId={activeQuotationId}
            onActivate={setActiveQuotationId}
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

      <QuotationDetailPanel quotationId={activeQuotationId} />
    </div>
  )
}
