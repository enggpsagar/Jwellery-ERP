"use client"

import { DataTableToolbar } from "@/components/shared/data-table-toolbar"
import { exportQuotationsToExcel } from "@/lib/actions/quotation-actions"

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "converted", label: "Converted" },
  { value: "expired", label: "Expired" },
]

const SORT_OPTIONS = [
  { value: "quotationDate", label: "Sort by Date" },
  { value: "quotationNumber", label: "Sort by Quotation #" },
  { value: "totalAmount", label: "Sort by Amount" },
]

export function QuotationsToolbar() {
  return (
    <DataTableToolbar
      searchPlaceholder="Search by quotation number, customer..."
      sortOptions={SORT_OPTIONS}
      defaultSortBy="quotationDate"
      defaultSortOrder="desc"
      statusOptions={STATUS_OPTIONS}
      entityLabel="quotations"
      exportAction={exportQuotationsToExcel}
    />
  )
}
