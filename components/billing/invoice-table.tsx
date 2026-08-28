"use client"

import Link from "next/link"

import { RecordHoverCard } from "@/components/shared/record-hover-card"
import { Eye, ArrowLeftCircle } from "lucide-react"

import { InvoiceStatusBadge } from "@/components/billing/invoice-status-badge"

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
}

export function InvoiceTable({ invoices }: InvoiceTableProps) {
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
              <th className="px-4 py-3 text-left font-medium">Invoice #</th>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Customer</th>
              <th className="px-4 py-3 text-left font-medium">Source</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Total</th>
              <th className="px-4 py-3 text-left font-medium">Balance</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">
                  <RecordHoverCard
                    label={invoice.invoiceNumber}
                    href={`/billing/${invoice.id}`}
                    title={invoice.invoiceNumber}
                    subtitle={invoice.customer?.name ?? undefined}
                    footerLabel="Open invoice"
                    sections={[
                      {
                        fields: [
                          {
                            label: "Date",
                            value: new Date(invoice.invoiceDate).toLocaleDateString("en-IN"),
                          },
                          { label: "Customer", value: invoice.customer?.name },
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
                </td>
                <td className="px-4 py-3">
                  {new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}
                </td>
                <td className="px-4 py-3">
                  {invoice.customer ? (
                    <RecordHoverCard
                      label={invoice.customer.name}
                      href={`/customers/${invoice.customer.id}?from=${encodeURIComponent("/billing")}`}
                      title={invoice.customer.name}
                      subtitle={invoice.customer.phone ?? undefined}
                      footerLabel="View customer"
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
                <td className="px-4 py-3">
                  <Link
                    href={`/billing/${invoice.id}`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
                    title="View invoice"
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
