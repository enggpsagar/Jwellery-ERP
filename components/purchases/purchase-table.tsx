"use client"

import Link from "next/link"
import { Eye } from "lucide-react"

import { PurchaseStatusBadge } from "@/components/purchases/purchase-status-badge"

type PurchaseRow = {
  id: string
  purchaseNumber: string
  purchaseDate: string
  status: string
  totalAmount: number
  balanceAmount: number
  vendor: { id: string; name: string; phone: string | null } | null
}

type PurchaseTableProps = {
  purchases: PurchaseRow[]
}

export function PurchaseTable({ purchases }: PurchaseTableProps) {
  if (!purchases.length) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No purchases found yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Purchase #</th>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Vendor</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Total</th>
              <th className="px-4 py-3 text-left font-medium">Balance</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {purchases.map((purchase) => (
              <tr key={purchase.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/purchases/${purchase.id}`} className="hover:underline">
                    {purchase.purchaseNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {new Date(purchase.purchaseDate).toLocaleDateString("en-IN")}
                </td>
                <td className="px-4 py-3">{purchase.vendor?.name ?? "-"}</td>
                <td className="px-4 py-3">
                  <PurchaseStatusBadge status={purchase.status as any} />
                </td>
                <td className="px-4 py-3">₹{purchase.totalAmount.toFixed(2)}</td>
                <td className="px-4 py-3">
                  {purchase.balanceAmount > 0 ? (
                    <span className="text-red-600 font-medium">
                      ₹{purchase.balanceAmount.toFixed(2)}
                    </span>
                  ) : (
                    "₹0.00"
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/purchases/${purchase.id}`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
                    title="View purchase"
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
