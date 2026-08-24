"use client"

import { DataTableToolbar } from "@/components/shared/data-table-toolbar"
import { exportKachaInvoicesToExcel } from "@/lib/actions/kacha-invoice-actions"

const SORT_OPTIONS = [
  { value: "invoiceDate", label: "Sort by Date" },
  { value: "slipNumber", label: "Sort by Slip #" },
  { value: "totalAmount", label: "Sort by Amount" },
]

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "PAID", label: "Paid" },
  { value: "PARTIAL", label: "Partial" },
  { value: "CANCELLED", label: "Cancelled" },
]

/** Search+sort+status-filter+export toolbar for the Kacha Slips list. */
export function KachaInvoicesToolbar() {
  return (
    <DataTableToolbar
      searchPlaceholder="Search by slip number, customer..."
      sortOptions={SORT_OPTIONS}
      defaultSortBy="invoiceDate"
      statusOptions={STATUS_OPTIONS}
      entityLabel="kacha slips"
      exportAction={exportKachaInvoicesToExcel}
    />
  )
}
