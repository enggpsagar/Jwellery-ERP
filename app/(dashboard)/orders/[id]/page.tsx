import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getDraftOrderById } from "@/lib/actions/draft-order-actions"
import { getPaymentFormKarigars } from "@/lib/actions/payments-actions"
import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions"
import { getPurityLabel } from "@/lib/purity"

import { DraftOrderStatusBadge } from "@/components/orders/draft-order-status-badge"
import { SendToKarigarDialog } from "@/components/orders/send-to-karigar-dialog"
import { CancelDraftOrderButton } from "@/components/orders/cancel-draft-order-button"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatShortDate } from "@/lib/utils"

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const order = await getDraftOrderById(id)
  return { title: order ? `Draft Order ${order.orderNumber}` : "Draft Order" }
}

export default async function DraftOrderDetailPage({ params }: Props) {
  const { id } = await params
  const order = await getDraftOrderById(id)
  if (!order) notFound()

  const [karigars, locations, defaultLocationId] = await Promise.all([
    getPaymentFormKarigars(),
    getStoreLocations(),
    getDefaultLocationId(),
  ])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={`Draft Order ${order.orderNumber}`}
        description={order.customer ? `For ${order.customer.name}` : undefined}
        backHref="/orders"
        backLabel="Back to Draft Orders"
        action={
          order.status === "DRAFT" ? (
            <div className="flex items-center gap-2">
              <CancelDraftOrderButton orderId={order.id} />
              <SendToKarigarDialog
                orderId={order.id}
                karigars={karigars}
                locations={locations}
                defaultLocationId={order.locationId ?? defaultLocationId}
              />
            </div>
          ) : undefined
        }
      />

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
            <div className="text-muted-foreground">Customer</div>
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
    </main>
  )
}
