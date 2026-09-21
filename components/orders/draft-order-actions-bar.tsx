"use client"

import Link from "next/link"
import { PackageCheck } from "lucide-react"

import type { DraftOrderDetail } from "@/lib/actions/draft-order-actions"
import { EditDraftOrderDialog } from "@/components/orders/edit-draft-order-dialog"
import { CancelDraftOrderButton } from "@/components/orders/cancel-draft-order-button"
import { SendToKarigarDialog } from "@/components/orders/send-to-karigar-dialog"
import { Button } from "@/components/ui/button"
import type { KarigarOption } from "@/components/karigars/karigar-select"
import type { LocationOption } from "@/components/shared/location-select"

type DraftOrderActionsBarProps = {
  order: DraftOrderDetail
  karigars: KarigarOption[]
  locations: LocationOption[]
  defaultLocationId?: string | null
  /** BusinessSettings.sendToArtisanEnabled — hides Send to Artisan when off (see its schema doc comment). Defaults true so existing callers that haven't been updated to pass it don't lose the button. */
  sendToArtisanEnabled?: boolean
}

/**
 * Every action available on a draft order — Edit, Cancel, Send to Artisan
 * while still DRAFT; Receive Items once it's been SENT_TO_KARIGAR. Shared
 * between the standalone /orders/[id] page and the Draft Orders list's
 * inline detail panel so the two can never drift apart, same convention as
 * InvoiceActionsBar/QuotationActionsBar.
 *
 * Edit/Cancel/Send to Artisan only ever show while still DRAFT — once sent
 * to an artisan, the order itself is a record of what actually happened,
 * not something to edit/cancel/re-send. RECEIVED/CANCELLED show nothing
 * further; there's nothing left to do.
 */
export function DraftOrderActionsBar({
  order,
  karigars,
  locations,
  defaultLocationId,
  sendToArtisanEnabled = true,
}: DraftOrderActionsBarProps) {
  if (order.status === "SENT_TO_KARIGAR" && order.karigarJob) {
    // The item-level Receive Items page (receiveItemsFromKarigar,
    // inventory-stock-actions.ts) is the only place this order's items
    // actually get matched to what came back and turned into real Product/
    // InventoryStock rows — sendDraftOrderToKarigar links this order to
    // that job (karigarJobId) precisely so this page can find its way
    // there. Previously nothing in the UI linked to it at all once an
    // order left DRAFT, so a sent order had no discoverable path to ever
    // being received.
    return (
      <Button
        asChild
        className="gap-1.5 bg-[var(--chart-1)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-1)_88%,black)]"
      >
        <Link href={`/karigars/${order.karigarJob.karigarId}/receive-items/${order.karigarJob.id}`}>
          <PackageCheck className="h-4 w-4" />
          Receive Items
        </Link>
      </Button>
    )
  }

  if (order.status !== "DRAFT") return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <EditDraftOrderDialog
        orderId={order.id}
        orderDate={order.orderDate}
        expectedDate={order.expectedDate}
        notes={order.notes}
      />
      <CancelDraftOrderButton orderId={order.id} />
      {sendToArtisanEnabled ? (
        <SendToKarigarDialog
          orderId={order.id}
          karigars={karigars}
          locations={locations}
          defaultLocationId={order.locationId ?? defaultLocationId}
        />
      ) : null}
    </div>
  )
}
