"use client"

import { DataTableToolbar } from "@/components/shared/data-table-toolbar"
import { exportCreditNotesToExcel } from "@/lib/actions/credit-note-actions"

const SORT_OPTIONS = [
  { value: "creditNoteDate", label: "Credit Note Date" },
  { value: "totalAmount", label: "Amount" },
  { value: "creditNoteNumber", label: "Credit Note #" },
]

/** Search+sort+date-range+export bar for /billing/credit-notes — same shared component every other list page uses, no row-select since this list has no bulk actions. */
export function CreditNotesToolbar() {
  return (
    <DataTableToolbar
      searchPlaceholder="Search by credit note #, customer, invoice..."
      sortOptions={SORT_OPTIONS}
      defaultSortBy="creditNoteDate"
      dateField="Credit Note Date"
      hidePageSize
      entityLabel="credit notes"
      exportAction={exportCreditNotesToExcel}
    />
  )
}
