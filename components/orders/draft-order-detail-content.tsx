import Link from "next/link"

import type { DraftOrderDetail } from "@/lib/actions/draft-order-actions"
import { getPurityLabel } from "@/lib/purity"
import { formatShortDate } from "@/lib/utils"
import { DraftOrderStatusBadge } from "@/components/orders/draft-order-status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type DraftOrderDetailContentProps = {
  order: DraftOrderDetail
}

/**
 * The body of a draft order's detail view — Order Details card and
 * Requested Items card. Shared between the standalone /orders/[id] page
 * and the Draft Orders list's inline detail panel, same convention as
 * InvoiceDetailContent/QuotationDetailContent, so the two can never drift
 * apart.
 */
export function DraftOrderDetailContent({ order }: DraftOrderDetailContentProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Order Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-muted-foreground">Status</div>
            <div className="mt-1">
              <DraftOrderStatusBadge status={order.status} />
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Order Date</div>
            <div className="mt-1 font-medium">{formatShortDate(order.orderDate)}</div>
          </div>
          {order.expectedDate ? (
            <div>
              <div className="text-muted-foreground">Expected Date</div>
              <div className="mt-1 font-medium">{formatShortDate(order.expectedDate)}</div>
            </div>
          ) : null}
          <div>
            <div className="text-muted-foreground">Party</div>
            <div className="mt-1 font-medium">
              {order.customer ? (
                <Link href={`/customers/${order.customer.id}`} className="text-primary hover:underline">
                  {order.customer.name}
                </Link>
              ) : (
                "—"
              )}
            </div>
          </div>
          {order.karigarJob ? (
            <div>
              <div className="text-muted-foreground">Artisan Job</div>
              <div className="mt-1 font-medium">
                <Link
                  href={`/karigars/${order.karigarJob.karigarId}`}
                  className="text-primary hover:underline"
                >
                  {order.karigarJob.jobNumber ?? "View Job"}
                </Link>
              </div>
            </div>
          ) : null}
          {order.notes ? (
            <div className="md:col-span-3">
              <div className="text-muted-foreground">Notes</div>
              <div className="mt-1">{order.notes}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Requested Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{item.itemName}</span>
                  <span className="ml-2 text-sm text-muted-foreground">x{item.quantity}</span>
                </div>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                    item.fulfilled ? "bg-green-100 text-green-700" : "bg-muted text-foreground"
                  }`}
                >
                  {item.fulfilled ? "Received" : "Pending"}
                </span>
              </div>

              <div className="mt-2 grid gap-1 text-sm text-muted-foreground md:grid-cols-4">
                {item.metalName ? <div>Metal: {item.metalName}</div> : null}
                {item.purity ? <div>Purity: {getPurityLabel(item.purity)}</div> : null}
                {item.estimatedWeight ? <div>Est. Weight: {item.estimatedWeight}g</div> : null}
                {item.estimatedRate ? <div>Est. Rate: ₹{item.estimatedRate}</div> : null}
              </div>

              {item.designNotes ? (
                <p className="mt-2 text-sm text-muted-foreground">{item.designNotes}</p>
              ) : null}

              {item.fulfilled && (item.product || item.inventoryStock) ? (
                <div className="mt-3 flex flex-wrap gap-4 border-t pt-3 text-sm">
                  {item.product ? (
                    <Link
                      href={`/inventory/products/${item.product.id}`}
                      className="text-primary hover:underline"
                    >
                      Product: {item.product.name} ({item.product.productCode})
                    </Link>
                  ) : null}
                  {item.inventoryStock ? (
                    <Link
                      href={`/inventory/stock/${item.inventoryStock.id}`}
                      className="text-primary hover:underline"
                    >
                      Stock: {item.inventoryStock.stockCode} ({item.inventoryStock.status})
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
