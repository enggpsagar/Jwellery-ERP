"use client"

import Link from "next/link"

import { DraftOrderStatusBadge } from "@/components/orders/draft-order-status-badge"
import { formatShortDate } from "@/lib/utils"
import type { DraftOrderRow } from "@/lib/actions/draft-order-actions"

type DraftOrdersTableProps = {
  orders: DraftOrderRow[]
}

export function DraftOrdersTable({ orders }: DraftOrdersTableProps) {
  if (!orders.length) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No draft orders yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Order #</th>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Customer</th>
              <th className="px-4 py-3 text-left font-medium">Items</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Artisan Job</th>
            </tr>
          </thead>

          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/orders/${order.id}`} className="text-primary hover:underline">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatShortDate(order.orderDate)}
                </td>
                <td className="px-4 py-3">{order.customer?.name ?? "—"}</td>
                <td className="px-4 py-3">{order.itemCount}</td>
                <td className="px-4 py-3">
                  <DraftOrderStatusBadge status={order.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {order.karigarJob?.jobNumber ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
