"use client"

import Link from "next/link"

type StockRow = {
  id: string
  stockCode: string
  productId: string
  productName: string
  productCode: string
  metalType: string
  purity: string | null
  quantity: number
  status: string
  grossWeight: number | null
  netWeight: number | null
  makingCharge: number | null
  saleAmount: number | null
  location: string | null
  purchaseDate: string | null
  createdAt: string
}

type StockTableProps = {
  stockItems: StockRow[]
}

function formatNumber(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined) return "-"
  return Number(value).toFixed(digits)
}

function formatAmount(value: number | null | undefined) {
  if (value === null || value === undefined) return "-"
  return `₹${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("en-IN")
}

export function StockTable({ stockItems }: StockTableProps) {
  if (!stockItems.length) {
    return (
      <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
        No inventory stock found yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Stock Code</th>
              <th className="px-4 py-3 text-left font-medium">Product</th>
              <th className="px-4 py-3 text-left font-medium">Metal</th>
              <th className="px-4 py-3 text-left font-medium">Purity</th>
              <th className="px-4 py-3 text-left font-medium">Qty</th>
              <th className="px-4 py-3 text-left font-medium">Gross Wt.</th>
              <th className="px-4 py-3 text-left font-medium">Net Wt.</th>
              <th className="px-4 py-3 text-left font-medium">Making</th>
              <th className="px-4 py-3 text-left font-medium">Sale Amt.</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Location</th>
              <th className="px-4 py-3 text-left font-medium">Purchase Date</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
            </tr>
          </thead>

          <tbody>
            {stockItems.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{item.stockCode}</td>

                <td className="px-4 py-3">
                  <div className="font-medium">{item.productName}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.productCode}
                  </div>
                </td>

                <td className="px-4 py-3">{item.metalType}</td>
                <td className="px-4 py-3">{item.purity ?? "-"}</td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">{formatNumber(item.grossWeight)}</td>
                <td className="px-4 py-3">{formatNumber(item.netWeight)}</td>
                <td className="px-4 py-3">{formatAmount(item.makingCharge)}</td>
                <td className="px-4 py-3">{formatAmount(item.saleAmount)}</td>

                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                    {item.status}
                  </span>
                </td>

                <td className="px-4 py-3">{item.location ?? "-"}</td>
                <td className="px-4 py-3">{formatDate(item.purchaseDate)}</td>

                <td className="px-4 py-3">
                  <Link
                    href={`/inventory/stock/${item.id}`}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    View
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