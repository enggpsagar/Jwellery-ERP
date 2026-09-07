"use client"

import Link from "next/link"

import { RecordHoverCard } from "@/components/shared/record-hover-card"
import { ArrowLeftCircle } from "lucide-react"

import { InvoiceStatusBadge } from "@/components/billing/invoice-status-badge"
import { SortableTableHead } from "@/components/shared/sortable-table-head"
import { cn, formatShortDate } from "@/lib/utils"

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

type InvoiceRow = {
  id: string
  invoiceNumber: string
  invoiceDate: string
  status: string
  totalAmount: number
  balanceAmount: number
  customer: { id: string; name: string; phone: string | null } | null
  convertedFromKacha: { id: string; slipNumber: string } | null
}

type InvoiceTableProps = {
  invoices: InvoiceRow[]
  /** Which row's detail shows in the panel alongside this table — when
   * provided, a row click activates it instead of the row's own hover-card
   * link navigating away. Same convention as PurchaseTable/CustomersTable. */
  activeInvoiceId?: string | null
  onActivate?: (id: string) => void
}

export function InvoiceTable({ invoices, activeInvoiceId, onActivate }: InvoiceTableProps) {
  if (!invoices.length) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No invoices found yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <SortableTableHead label="Invoice #" sortKey="invoiceNumber" defaultSortBy="invoiceDate" />
              <SortableTableHead label="Date" sortKey="invoiceDate" defaultSortBy="invoiceDate" />
              <th className="px-4 py-3 text-left font-medium">Party</th>
              <th className="px-4 py-3 text-left font-medium">Source</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <SortableTableHead label="Total" sortKey="totalAmount" defaultSortBy="invoiceDate" />
              <th className="px-4 py-3 text-left font-medium">Balance</th>
            </tr>
          </thead>

          <tbody>
            {invoices.map((invoice) => {
              const isActive = activeInvoiceId === invoice.id
              return (
              <tr
                key={invoice.id}
                onClick={() => onActivate?.(invoice.id)}
                className={cn(
                  "border-b last:border-0",
                  onActivate && "cursor-pointer hover:bg-accent/50",
                  isActive && "bg-accent",
                )}
              >
                <td className="px-4 py-3 font-medium">
                  <RecordHoverCard
                    label={invoice.invoiceNumber}
                    href={onActivate ? undefined : `/billing/${invoice.id}`}
                    title={invoice.invoiceNumber}
                    subtitle={invoice.customer?.name ?? undefined}
                    footerLabel="Open invoice"
                    sections={[
                      {
                        fields: [
                          {
                            label: "Date",
                            value: formatShortDate(invoice.invoiceDate),
                          },
                          { label: "Party", value: invoice.customer?.name },
                          { label: "Phone", value: invoice.customer?.phone },
                          { label: "Status", value: invoice.status },
                        ],
                      },
                      {
                        fields: [
                          { label: "Total", value: inr(invoice.totalAmount) },
                          {
                            label: "Balance",
                            value:
                              invoice.balanceAmount > 0 ? (
                                <span className="text-red-600">{inr(invoice.balanceAmount)}</span>
                              ) : (
                                "Settled"
                              ),
                          },
                          {
                            label: "From slip",
                            value: invoice.convertedFromKacha?.slipNumber,
                          },
                        ],
                      },
                    ]}
                  />
                </td>
                <td className="px-4 py-3">
                  {formatShortDate(invoice.invoiceDate)}
                </td>
                <td className="px-4 py-3">
                  {invoice.customer ? (
                    <RecordHoverCard
                      label={invoice.customer.name}
                      href={`/customers/${invoice.customer.id}?from=${encodeURIComponent("/billing")}`}
                      title={invoice.customer.name}
                      subtitle={invoice.customer.phone ?? undefined}
                      footerLabel="View party"
                      className="text-primary underline-offset-4 hover:underline"
                      sections={[
                        {
                          fields: [
                            { label: "Invoice", value: invoice.invoiceNumber },
                            { label: "Date", value: invoice.invoiceDate },
                            { label: "Status", value: invoice.status },
                          ],
                        },
                        {
                          fields: [
                            { label: "Total", value: inr(invoice.totalAmount) },
                            {
                              label: "Balance",
                              value:
                                invoice.balanceAmount > 0
                                  ? inr(invoice.balanceAmount)
                                  : "Settled",
                            },
                            {
                              label: "From slip",
                              value: invoice.convertedFromKacha?.slipNumber,
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
                  {invoice.convertedFromKacha ? (
                    <Link
                      href={`/billing/kacha/${invoice.convertedFromKacha.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                      title={`View Kacha slip ${invoice.convertedFromKacha.slipNumber}`}
                    >
                      <ArrowLeftCircle className="h-3.5 w-3.5" />
                      From Kacha ({invoice.convertedFromKacha.slipNumber})
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">Direct Sale</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <InvoiceStatusBadge status={invoice.status as any} />
                </td>
                <td className="px-4 py-3">₹{invoice.totalAmount.toFixed(2)}</td>
                <td className="px-4 py-3">
                  {invoice.balanceAmount > 0 ? (
                    <span className="text-red-600 font-medium">
                      ₹{invoice.balanceAmount.toFixed(2)}
                    </span>
                  ) : (
                    "₹0.00"
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
