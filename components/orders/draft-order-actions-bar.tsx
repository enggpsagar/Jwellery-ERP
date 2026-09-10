"use client"

import type { DraftOrderDetail } from "@/lib/actions/draft-order-actions"
import { EditDraftOrderDialog } from "@/components/orders/edit-draft-order-dialog"
import { CancelDraftOrderButton } from "@/components/orders/cancel-draft-order-button"
import { SendToKarigarDialog } from "@/components/orders/send-to-karigar-dialog"
import type { KarigarOption } from "@/components/karigars/karigar-select"
import type { LocationOption } from "@/components/shared/location-select"

type DraftOrderActionsBarProps = {
  order: DraftOrderDetail
  karigars: KarigarOption[]
  locations: LocationOption[]
  defaultLocationId?: string | null
}

/**
 * Every action available on a draft order — Edit, Cancel, Send to Artisan.
 * Shared between the standalone /orders/[id] page and the Draft Orders
 * list's inline detail panel so the two can never drift apart, same
 * convention as InvoiceActionsBar/QuotationActionsBar.
 *
 * All three only ever show while still DRAFT — once sent to an artisan or
 * received, the order is a record of what actually happened, not
 * something to edit/cancel/re-send.
 */
export function DraftOrderActionsBar({
  order,
  karigars,
  locations,
  defaultLocationId,
}: DraftOrderActionsBarProps) {
  if (order.status !== "DRAFT") return null

  return (
    <div className="flex items-center gap-2">
      <EditDraftOrderDialog
        orderId={order.id}
        orderDate={order.orderDate}
        expectedDate={order.expectedDate}
        notes={order.notes}
      />
      <CancelDraftOrderButton orderId={order.id} />
      <SendToKarigarDialog
        orderId={order.id}
        karigars={karigars}
        locations={locations}
        defaultLocationId={order.locationId ?? defaultLocationId}
      />
    </div>
  )
}
