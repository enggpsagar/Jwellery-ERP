"use client"

import { useEffect, useState } from "react"
import { ClipboardList } from "lucide-react"

import { getDraftOrderById, type DraftOrderDetail } from "@/lib/actions/draft-order-actions"
import type { KarigarOption } from "@/components/karigars/karigar-select"
import type { LocationOption } from "@/components/shared/location-select"
import { DraftOrderActionsBar } from "@/components/orders/draft-order-actions-bar"
import { DraftOrderDetailContent } from "@/components/orders/draft-order-detail-content"
import { Skeleton } from "@/components/ui/skeleton"

type DraftOrderDetailPanelProps = {
  orderId: string | null
  karigars: KarigarOption[]
  locations: LocationOption[]
  defaultLocationId: string | null
}

/**
 * The right-hand pane of the Draft Orders master-detail layout — fetches
 * and shows exactly what the standalone /orders/[id] page shows (same
 * DraftOrderActionsBar/DraftOrderDetailContent), just inline next to the
 * list instead of a full navigation. Same convention as
 * QuotationDetailPanel/InvoiceDetailPanel. Karigars/locations are static
 * reference data (not order-specific), so they're passed down from the
 * page's own server fetch rather than re-fetched per order.
 */
export function DraftOrderDetailPanel({
  orderId,
  karigars,
  locations,
  defaultLocationId,
}: DraftOrderDetailPanelProps) {
  const [order, setOrder] = useState<DraftOrderDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!orderId) {
      setOrder(null)
      return
    }

    let cancelled = false
    setLoading(true)
    getDraftOrderById(orderId)
      .then((result) => {
        if (!cancelled) setOrder(result)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [orderId])

  if (!orderId) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <ClipboardList className="h-8 w-8" />
        <p className="text-sm">Select a draft order to view its details.</p>
      </div>
    )
  }

  if (loading || !order) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Draft Order {order.orderNumber}</h2>
        <DraftOrderActionsBar
          order={order}
          karigars={karigars}
          locations={locations}
          defaultLocationId={defaultLocationId}
        />
      </div>

      <DraftOrderDetailContent order={order} />
    </div>
  )
}
