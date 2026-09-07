"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef } from "react"

import { RecordHoverCard } from "@/components/shared/record-hover-card"
import { ArrowRightCircle } from "lucide-react"

import { QuotationStatusBadge } from "@/components/quotations/quotation-status-badge"
import { SortableTableHead } from "@/components/shared/sortable-table-head"
import { formatShortDate, cn } from "@/lib/utils"

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

type QuotationTableProps = {
  quotations: QuotationRow[]
  /** Bulk-action checkbox selection — omit to hide the checkbox column entirely. */
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
  /** Which row's detail is showing in the panel alongside this table — distinct from selectedIds, which is the bulk-action checkbox selection. */
  activeQuotationId?: string | null
  onActivate?: (id: string) => void
}

export function QuotationTable({
  quotations,
  selectedIds,
  onSelectionChange,
  activeQuotationId,
  onActivate,
}: QuotationTableProps) {
  const allIds = useMemo(() => quotations.map((q) => q.id), [quotations])

  const allSelected =
    !!selectedIds && allIds.length > 0 && allIds.every((id) => selectedIds.includes(id))
  const someSelected =
    !!selectedIds && allIds.some((id) => selectedIds.includes(id)) && !allSelected

  const headerCheckboxRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  const toggleAll = (checked: boolean) => {
    if (!selectedIds || !onSelectionChange) return
    if (checked) {
      onSelectionChange(Array.from(new Set([...selectedIds, ...allIds])))
      return
    }
    onSelectionChange(selectedIds.filter((id) => !allIds.includes(id)))
  }

  const toggleOne = (id: string, checked: boolean) => {
    if (!selectedIds || !onSelectionChange) return
    if (checked) {
      onSelectionChange(Array.from(new Set([...selectedIds, id])))
      return
    }
    onSelectionChange(selectedIds.filter((selectedId) => selectedId !== id))
  }

  const showCheckboxes = !!selectedIds && !!onSelectionChange

  if (!quotations.length) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No quotations found yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              {showCheckboxes ? (
                <th className="w-10 px-4 py-3">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                    aria-label="Select all quotations"
                  />
                </th>
              ) : null}
              <SortableTableHead label="Quotation #" sortKey="quotationNumber" defaultSortBy="quotationDate" />
              <SortableTableHead label="Date" sortKey="quotationDate" defaultSortBy="quotationDate" />
              <th className="px-4 py-3 text-left font-medium">Valid Until</th>
              <th className="px-4 py-3 text-left font-medium">Party</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <SortableTableHead label="Total" sortKey="totalAmount" defaultSortBy="quotationDate" />
              <th className="px-4 py-3 text-left font-medium">Converted</th>
            </tr>
          </thead>

          <tbody>
            {quotations.map((quotation) => {
              const isActive = activeQuotationId === quotation.id
              return (
              <tr
                key={quotation.id}
                onClick={() => onActivate?.(quotation.id)}
                className={cn(
                  "border-b last:border-0",
                  onActivate && "cursor-pointer hover:bg-accent/50",
                  isActive && "bg-accent",
                )}
              >
                {showCheckboxes ? (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds!.includes(quotation.id)}
                      onChange={(e) => toggleOne(quotation.id, e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                      aria-label={`Select ${quotation.quotationNumber}`}
                    />
                  </td>
                ) : null}
                <td className="px-4 py-3 font-medium">
                  <RecordHoverCard
                    label={quotation.quotationNumber}
                    href={onActivate ? undefined : `/quotations/${quotation.id}`}
                    title={quotation.quotationNumber}
                    subtitle={quotation.customer?.name ?? undefined}
                    footerLabel="Open quotation"
                    sections={[
                      {
                        fields: [
                          {
                            label: "Date",
                            value: formatShortDate(quotation.quotationDate),
                          },
                          {
                            label: "Valid until",
                            value: quotation.validUntil
                              ? formatShortDate(quotation.validUntil)
                              : null,
                          },
                          { label: "Party", value: quotation.customer?.name },
                          { label: "Status", value: quotation.status },
                        ],
                      },
                      {
                        fields: [
                          { label: "Total", value: inr(quotation.totalAmount) },
                          {
                            label: "Invoiced as",
                            value: quotation.convertedTo?.invoiceNumber,
                          },
                        ],
                      },
                    ]}
                  />
                </td>
                <td className="px-4 py-3">
                  {formatShortDate(quotation.quotationDate)}
                </td>
                <td className="px-4 py-3">
                  {quotation.validUntil
                    ? formatShortDate(quotation.validUntil)
                    : "-"}
                </td>
                <td className="px-4 py-3">
                  {quotation.customer ? (
                    <RecordHoverCard
                      label={quotation.customer.name}
                      href={`/customers/${quotation.customer.id}`}
                      title={quotation.customer.name}
                      subtitle={quotation.customer.phone ?? undefined}
                      footerLabel="View party"
                      sections={[
                        {
                          fields: [
                            { label: "Quotation", value: quotation.quotationNumber },
                            {
                              label: "Date",
                              value: formatShortDate(quotation.quotationDate),
                            },
                            {
                              label: "Valid until",
                              value: quotation.validUntil
                                ? formatShortDate(quotation.validUntil)
                                : null,
                            },
                            { label: "Status", value: quotation.status },
                          ],
                        },
                        {
                          fields: [
                            { label: "Total", value: inr(quotation.totalAmount) },
                            {
                              label: "Invoiced as",
                              value: quotation.convertedTo?.invoiceNumber,
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
                  <QuotationStatusBadge status={quotation.status} />
                </td>
                <td className="px-4 py-3">₹{quotation.totalAmount.toFixed(2)}</td>
                <td className="px-4 py-3">
                  {quotation.convertedTo ? (
                    <Link
                      href={`/billing/${quotation.convertedTo.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      title={`View Invoice ${quotation.convertedTo.invoiceNumber}`}
                    >
                      <ArrowRightCircle className="h-3.5 w-3.5" />
                      Invoice {quotation.convertedTo.invoiceNumber}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not converted</span>
                  )}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
