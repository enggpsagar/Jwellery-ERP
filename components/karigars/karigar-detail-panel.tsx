"use client"

import { useEffect, useState } from "react"
import { Hammer } from "lucide-react"

import { getKarigarDetailBundle, type KarigarDetailBundle } from "@/lib/actions/karigar-actions"
import { IssueMaterialDialog } from "@/components/karigars/issue-material-dialog"
import { ReceiveMaterialDialog } from "@/components/karigars/receive-material-dialog"
import { RecordKarigarPaymentDialog } from "@/components/karigars/record-karigar-payment-dialog"
import { KarigarDetailContent } from "@/components/karigars/karigar-detail-content"
import { KarigarRowActions } from "@/components/karigars/karigar-row-actions"
import { Skeleton } from "@/components/ui/skeleton"
import { toTitleCase } from "@/lib/utils"

type KarigarDetailPanelProps = {
  karigarId: string | null
}

/**
 * The right-hand pane of the Karigars master-detail layout — fetches and
 * shows exactly what the standalone /karigars/[id] page shows (same
 * KarigarDetailContent, fed by the same getKarigarDetailBundle), just
 * inline next to the list instead of a full navigation.
 */
export function KarigarDetailPanel({ karigarId }: KarigarDetailPanelProps) {
  const [bundle, setBundle] = useState<KarigarDetailBundle | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!karigarId) {
      setBundle(null)
      return
    }

    let cancelled = false
    setLoading(true)
    getKarigarDetailBundle(karigarId)
      .then((result) => {
        if (!cancelled) setBundle(result)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [karigarId])

  if (!karigarId) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <Hammer className="h-8 w-8" />
        <p className="text-sm">Select a karigar to view their details.</p>
      </div>
    )
  }

  if (loading || !bundle) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  const { karigar, metals, locations, defaultLocationId, materialCounts } = bundle

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{toTitleCase(karigar.name)}</h2>
          <p className="text-sm text-muted-foreground">
            Code: {karigar.code || "-"} · Mobile: {karigar.mobile || "-"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <IssueMaterialDialog
            karigarId={karigar.id}
            metals={metals}
            assignedMetalTypeIds={karigar.assignedMetalTypeIds}
            locations={locations}
            defaultLocationId={defaultLocationId}
            count={materialCounts.issuedCount}
          />
          <ReceiveMaterialDialog
            karigarId={karigar.id}
            metals={metals}
            assignedMetalTypeIds={karigar.assignedMetalTypeIds}
            locations={locations}
            defaultLocationId={defaultLocationId}
            count={materialCounts.receivedCount}
          />
          <RecordKarigarPaymentDialog karigarId={karigar.id} />
          <KarigarRowActions
            karigarId={karigar.id}
            karigarName={karigar.name}
            metals={metals}
            assignedMetalTypeIds={karigar.assignedMetalTypeIds}
            locations={locations}
            defaultLocationId={defaultLocationId}
            showView={false}
            showIssueMaterial={false}
          />
        </div>
      </div>

      <KarigarDetailContent bundle={bundle} />
    </div>
  )
}
