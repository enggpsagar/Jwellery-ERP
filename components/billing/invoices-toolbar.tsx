"use client"

import { DataTableToolbar } from "@/components/shared/data-table-toolbar"
import { exportInvoicesToExcel } from "@/lib/actions/invoice-actions"

const SORT_OPTIONS = [
  { value: "invoiceDate", label: "Sort by Date" },
  { value: "invoiceNumber", label: "Sort by Invoice #" },
  { value: "totalAmount", label: "Sort by Amount" },
]

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "PAID", label: "Paid" },
  { value: "PARTIAL", label: "Partial" },
  { value: "CANCELLED", label: "Cancelled" },
]

/** Search+sort+status-filter+export toolbar for the Invoices (Pakka) list. */
export function InvoicesToolbar() {
  return (
    <DataTableToolbar
      searchPlaceholder="Search by invoice number, customer..."
      sortOptions={SORT_OPTIONS}
      defaultSortBy="invoiceDate"
      statusOptions={STATUS_OPTIONS}
      entityLabel="invoices"
      exportAction={exportInvoicesToExcel}
    />
  )
}
