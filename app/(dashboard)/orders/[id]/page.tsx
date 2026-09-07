import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getDraftOrderById } from "@/lib/actions/draft-order-actions"
import { getPaymentFormKarigars } from "@/lib/actions/payments-actions"
import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions"

import { DraftOrderActionsBar } from "@/components/orders/draft-order-actions-bar"
import { DraftOrderDetailContent } from "@/components/orders/draft-order-detail-content"
import { PageBackHeader } from "@/components/shared/page-back-header"

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
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <PageBackHeader
        title={`Draft Order ${order.orderNumber}`}
        description={order.customer ? `For ${order.customer.name}` : undefined}
        backHref="/orders"
        backLabel="Back to Draft Orders"
        action={
          <DraftOrderActionsBar
            order={order}
            karigars={karigars}
            locations={locations}
            defaultLocationId={order.locationId ?? defaultLocationId}
          />
        }
      />

      <DraftOrderDetailContent order={order} />
    </main>
  )
}
