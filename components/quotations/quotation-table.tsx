"use client"

import Link from "next/link"
import { Eye, ArrowRightCircle } from "lucide-react"

import { QuotationStatusBadge } from "@/components/quotations/quotation-status-badge"

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
}

export function QuotationTable({ quotations }: QuotationTableProps) {
  if (!quotations.length) {
    return (
      <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
        No quotations found yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Quotation #</th>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Valid Until</th>
              <th className="px-4 py-3 text-left font-medium">Customer</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Total</th>
              <th className="px-4 py-3 text-left font-medium">Converted</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {quotations.map((quotation) => (
              <tr key={quotation.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/quotations/${quotation.id}`} className="hover:underline">
                    {quotation.quotationNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {new Date(quotation.quotationDate).toLocaleDateString("en-IN")}
                </td>
                <td className="px-4 py-3">
                  {quotation.validUntil
                    ? new Date(quotation.validUntil).toLocaleDateString("en-IN")
                    : "-"}
                </td>
                <td className="px-4 py-3">{quotation.customer?.name ?? "-"}</td>
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
                <td className="px-4 py-3">
                  <Link
                    href={`/quotations/${quotation.id}`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
                    title="View quotation"
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
