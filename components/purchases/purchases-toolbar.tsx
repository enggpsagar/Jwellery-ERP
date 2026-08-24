"use client"

import { InvoiceStatus } from "@prisma/client"

import { DataTableToolbar } from "@/components/shared/data-table-toolbar"
import { exportPurchasesToExcel } from "@/lib/actions/purchase-actions"

const STATUS_OPTIONS = [
  { value: InvoiceStatus.DRAFT, label: "Draft" },
  { value: InvoiceStatus.PAID, label: "Paid" },
  { value: InvoiceStatus.PARTIAL, label: "Partially Paid" },
  { value: InvoiceStatus.CANCELLED, label: "Cancelled" },
]

const SORT_OPTIONS = [
  { value: "purchaseDate", label: "Sort by Date" },
  { value: "purchaseNumber", label: "Sort by Purchase #" },
  { value: "totalAmount", label: "Sort by Amount" },
]

export function PurchasesToolbar() {
  return (
    <DataTableToolbar
      searchPlaceholder="Search by purchase number, vendor..."
      sortOptions={SORT_OPTIONS}
      defaultSortBy="purchaseDate"
      defaultSortOrder="desc"
      statusOptions={STATUS_OPTIONS}
      entityLabel="purchases"
      exportAction={exportPurchasesToExcel}
    />
  )
}
