"use client"

import * as React from "react"
import Link from "next/link"

import { RecordHoverCard } from "@/components/shared/record-hover-card"
import { Eye, ArrowRightCircle } from "lucide-react"

import { InvoiceStatusBadge } from "@/components/billing/invoice-status-badge"
import { SortableTableHead } from "@/components/shared/sortable-table-head"

/** Money as it reads on a jewellery ledger. */
function inr(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null
  const amount = Number(value)
  if (!Number.isFinite(amount)) return null
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount)
}

type KachaInvoiceRow = {
  id: string
  slipNumber: string
  invoiceDate: string
  status: string
  totalAmount: number
  balanceAmount: number
  convertedTo: { id: string; invoiceNumber: string } | null
  customer: { id: string; name: string; phone: string | null } | null
}

type KachaInvoiceTableProps = {
  kachaInvoices: KachaInvoiceRow[]
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
}

export function KachaInvoiceTable({
  kachaInvoices,
  selectedIds = [],
  onSelectionChange,
}: KachaInvoiceTableProps) {
  const allIds = React.useMemo(
    () => kachaInvoices.map((invoice) => invoice.id),
    [kachaInvoices],
  )

  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.includes(id))

  const someSelected =
    allIds.some((id) => selectedIds.includes(id)) && !allSelected

  const headerCheckboxRef = React.useRef<HTMLInputElement | null>(null)

  // "Some but not all" has no checked state of its own — it has to be set on
  // the DOM node, so the header box reads as partial rather than empty.
  React.useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  // Merge/subtract rather than replace: selection survives paging, so a user
  // can gather slips across pages before exporting or deleting.
  const toggleAll = (checked: boolean) => {
    if (!onSelectionChange) return
    onSelectionChange(
      checked
        ? Array.from(new Set([...selectedIds, ...allIds]))
        : selectedIds.filter((id) => !allIds.includes(id)),
    )
  }

  const toggleOne = (id: string, checked: boolean) => {
    if (!onSelectionChange) return
    onSelectionChange(
      checked
        ? Array.from(new Set([...selectedIds, id]))
        : selectedIds.filter((selectedId) => selectedId !== id),
    )
  }

  if (!kachaInvoices.length) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No Kacha slips found yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="w-12 px-4 py-3">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                  aria-label="Select all kacha slips on this page"
                  className="h-4 w-4 rounded border-input"
                />
              </th>
              <SortableTableHead label="Slip #" sortKey="slipNumber" defaultSortBy="invoiceDate" />
              <SortableTableHead label="Date" sortKey="invoiceDate" defaultSortBy="invoiceDate" />
              <th className="px-4 py-3 text-left font-medium">Customer</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <SortableTableHead label="Total" sortKey="totalAmount" defaultSortBy="invoiceDate" />
              <th className="px-4 py-3 text-left font-medium">Balance</th>
              <th className="px-4 py-3 text-left font-medium">Converted</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {kachaInvoices.map((kachaInvoice) => (
              <tr key={kachaInvoice.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(kachaInvoice.id)}
                    onChange={(event) =>
                      toggleOne(kachaInvoice.id, event.target.checked)
                    }
                    aria-label={`Select slip ${kachaInvoice.slipNumber}`}
                    className="h-4 w-4 rounded border-input"
                  />
                </td>
                <td className="px-4 py-3 font-medium">
                  <RecordHoverCard
                    label={kachaInvoice.slipNumber}
                    href={`/billing/kacha/${kachaInvoice.id}`}
                    title={kachaInvoice.slipNumber}
                    subtitle={kachaInvoice.customer?.name ?? undefined}
                    footerLabel="Open slip"
                    sections={[
                      {
                        fields: [
                          {
                            label: "Date",
                            value: new Date(kachaInvoice.invoiceDate).toLocaleDateString("en-IN"),
                          },
                          { label: "Customer", value: kachaInvoice.customer?.name },
                          { label: "Phone", value: kachaInvoice.customer?.phone },
                          { label: "Status", value: kachaInvoice.status },
                        ],
                      },
                      {
                        fields: [
                          { label: "Total", value: inr(kachaInvoice.totalAmount) },
                          {
                            label: "Balance",
                            value:
                              kachaInvoice.balanceAmount > 0
                                ? inr(kachaInvoice.balanceAmount)
                                : "Settled",
                          },
                          {
                            label: "Converted to",
                            value: kachaInvoice.convertedTo?.invoiceNumber,
                          },
                        ],
                      },
                    ]}
                  />
                </td>
                <td className="px-4 py-3">
                  {new Date(kachaInvoice.invoiceDate).toLocaleDateString("en-IN")}
                </td>
                <td className="px-4 py-3">
                  {kachaInvoice.customer ? (
                    <RecordHoverCard
                      label={kachaInvoice.customer.name}
                      href={`/customers/${kachaInvoice.customer.id}?from=${encodeURIComponent("/billing/kacha")}`}
                      title={kachaInvoice.customer.name}
                      subtitle={kachaInvoice.customer.phone ?? undefined}
                      footerLabel="View customer"
                      className="text-primary underline-offset-4 hover:underline"
                      sections={[
                        {
                          fields: [
                            { label: "Slip", value: kachaInvoice.slipNumber },
                            {
                              label: "Date",
                              value: new Date(kachaInvoice.invoiceDate).toLocaleDateString("en-IN"),
                            },
                            { label: "Status", value: kachaInvoice.status },
                          ],
                        },
                        {
                          fields: [
                            { label: "Total", value: inr(kachaInvoice.totalAmount) },
                            {
                              label: "Balance",
                              value:
                                kachaInvoice.balanceAmount > 0
                                  ? inr(kachaInvoice.balanceAmount)
                                  : "Settled",
                            },
                            {
                              label: "Converted to",
                              value: kachaInvoice.convertedTo?.invoiceNumber,
                            },
                          ],
                        },
                      ]}
                    />
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3">
                  <InvoiceStatusBadge status={kachaInvoice.status as any} />
                </td>
                <td className="px-4 py-3">₹{kachaInvoice.totalAmount.toFixed(2)}</td>
                <td className="px-4 py-3">
                  {kachaInvoice.balanceAmount > 0 ? (
                    <span className="text-red-600 font-medium">
                      ₹{kachaInvoice.balanceAmount.toFixed(2)}
                    </span>
                  ) : (
                    "₹0.00"
                  )}
                </td>
                <td className="px-4 py-3">
                  {kachaInvoice.convertedTo ? (
                    <Link
                      href={`/billing/${kachaInvoice.convertedTo.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      title={`View Pakka Invoice ${kachaInvoice.convertedTo.invoiceNumber}`}
                    >
                      <ArrowRightCircle className="h-3.5 w-3.5" />
                      Converted to Pakka Invoice ({kachaInvoice.convertedTo.invoiceNumber})
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not converted</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/billing/kacha/${kachaInvoice.id}`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
                    title="View Kacha slip"
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
