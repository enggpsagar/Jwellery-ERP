"use client"

import { useEffect, useState } from "react"
import { Hammer } from "lucide-react"

import { getKarigarDetailBundle, type KarigarDetailBundle } from "@/lib/actions/karigar-actions"
import { KarigarDetailContent } from "@/components/karigars/karigar-detail-content"
import { Skeleton } from "@/components/ui/skeleton"
import { toTitleCase } from "@/lib/utils"

type DisabledKarigarDetailPanelProps = {
  karigarId: string | null
}

/**
 * The right-hand pane of the Disabled Artisans master-detail layout — same
 * KarigarDetailContent (balance cards, ledger, and the Status card's own
 * Active/Inactive toggle) the active Artisans page's own panel shows,
 * just without the header's Issue/Receive Material, Record Payment and
 * Edit/Disable/Delete actions — none of those apply to an artisan who
 * isn't currently active. Re-enabling happens via the Status card's own
 * toggle (already rendered inside KarigarDetailContent), not a second
 * "Enable" control here.
 */
export function DisabledKarigarDetailPanel({ karigarId }: DisabledKarigarDetailPanelProps) {
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
        <p className="text-sm">Select an artisan to view their details.</p>
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

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6">
      <h2 className="text-lg font-semibold">{toTitleCase(bundle.karigar.name)}</h2>

      <KarigarDetailContent bundle={bundle} />
    </div>
  )
}
