"use client"

import Link from "next/link"
import { Eye, ArrowLeftCircle } from "lucide-react"

import { InvoiceStatusBadge } from "@/components/billing/invoice-status-badge"

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
      <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
        No invoices found yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
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
                  <Link href={`/billing/${invoice.id}`} className="hover:underline">
                    {invoice.invoiceNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}
                </td>
                <td className="px-4 py-3">
                  {invoice.customer ? (
                    <Link
                      href={`/customers/${invoice.customer.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {invoice.customer.name}
                    </Link>
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
