"use client"

import { useEffect, useState } from "react"
import { PackagePlus } from "lucide-react"

import { getPurchaseById, type Purchase } from "@/lib/actions/purchase-actions"
import { PurchaseDetailContent } from "@/components/purchases/purchase-detail-content"
import { PurchaseRowActions } from "@/components/purchases/purchase-row-actions"
import { RecordPurchasePaymentDialog } from "@/components/purchases/record-purchase-payment-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import type { LocationOption } from "@/components/shared/location-select"

type PurchaseDetailPanelProps = {
  purchaseId: string | null
  locations: LocationOption[]
}

/**
 * The right-hand pane of the Purchases master-detail layout — fetches and
 * shows exactly what the standalone /purchases/[id] page shows (same
 * PurchaseDetailContent), just inline next to the list instead of a full
 * navigation. Re-fetches whenever the selected id changes — same
 * convention as CustomerDetailPanel.
 */
export function PurchaseDetailPanel({ purchaseId, locations }: PurchaseDetailPanelProps) {
  const [purchase, setPurchase] = useState<Purchase | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!purchaseId) {
      setPurchase(null)
      return
    }

    let cancelled = false
    setLoading(true)
    getPurchaseById(purchaseId)
      .then((result) => {
        if (!cancelled) setPurchase(result)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [purchaseId])

  if (!purchaseId) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <PackagePlus className="h-8 w-8" />
        <p className="text-sm">Select a purchase to view its details.</p>
      </div>
    )
  }

  if (loading || !purchase) {
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
        <h2 className="text-lg font-semibold">{purchase.purchaseNumber}</h2>
        <div className="flex items-center gap-2">
          <RecordPurchasePaymentDialog
            purchaseId={purchase.id}
            balanceAmount={purchase.balanceAmount}
          />
          <PurchaseRowActions purchase={purchase} locations={locations} />
        </div>
      </div>

      <PurchaseDetailContent purchase={purchase} />
    </div>
  )
}
