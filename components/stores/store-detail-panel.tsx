"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Gem, Pencil } from "lucide-react"

import {
  getStorePlanOverview,
  getStorePlanHistory,
  type StorePlanOverview,
  type PlanHistoryRow,
} from "@/lib/actions/store-plan-actions"
import { PlanStatusPill } from "@/components/stores/plan-presentation"
import { StoreDetailContent } from "@/components/stores/store-detail-content"
import { StoreStatusToggle } from "@/components/stores/store-status-toggle"
import { ChangePlanDialog } from "@/components/stores/change-plan-dialog"
import { StoreDeleteDialog } from "@/components/stores/store-delete-dialog"
import { RedeemCollaborationCodeDialog } from "@/components/stores/redeem-collaboration-code-dialog"
import { RequestStoreAccessButton } from "@/components/stores/request-store-access-button"
import { ExportStoreDataButton } from "@/components/stores/export-store-data-button"
import type { PlanRow } from "@/lib/actions/plan-actions"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

type StoreDetailPanelProps = {
  storeId: string | null
  plans: PlanRow[]
  currentPlanId: string | null
}

/**
 * The right-hand pane of the Stores master-detail layout — fetches and
 * shows exactly what the standalone /stores/[id] page shows (same
 * StoreDetailContent), just inline next to the list instead of a full
 * navigation.
 */
export function StoreDetailPanel({ storeId, plans, currentPlanId }: StoreDetailPanelProps) {
  const [overview, setOverview] = useState<StorePlanOverview | null>(null)
  const [history, setHistory] = useState<PlanHistoryRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!storeId) {
      setOverview(null)
      setHistory([])
      return
    }

    let cancelled = false
    setLoading(true)
    Promise.all([getStorePlanOverview(storeId), getStorePlanHistory(storeId)])
      .then(([overviewResult, historyResult]) => {
        if (!cancelled) {
          setOverview(overviewResult)
          setHistory(historyResult)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [storeId])

  // Re-fetches this store's overview in place — used after a sibling
  // mutation (the Active/Inactive toggle) changes something
  // getStorePlanOverview reads. router.refresh() alone can't reach this
  // panel's isActive, since it's client-fetched state, not a Server
  // Component prop.
  const refetchOverview = useCallback(() => {
    if (!storeId) return
    getStorePlanOverview(storeId).then(setOverview)
  }, [storeId])

  if (!storeId) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <Gem className="h-8 w-8" />
        <p className="text-sm">Select a store to view its details.</p>
      </div>
    )
  }

  if (loading || !overview) {
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
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{overview.name}</h2>
            <PlanStatusPill status={overview.status} />
          </div>
          <p className="font-mono text-sm text-muted-foreground">{overview.code}</p>
          {overview.email && (
            <p className="text-sm text-muted-foreground">{overview.email}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <StoreStatusToggle
            storeId={overview.storeId}
            isActive={overview.isActive}
            onSuccess={refetchOverview}
          />
          <ChangePlanDialog
            storeId={overview.storeId}
            storeName={overview.name}
            currentPlanId={currentPlanId}
            plans={plans}
          />
          <RedeemCollaborationCodeDialog storeId={overview.storeId} storeName={overview.name} />
          <RequestStoreAccessButton storeId={overview.storeId} storeName={overview.name} />
          <ExportStoreDataButton storeId={overview.storeId} />
          <Button
            asChild
            variant="outline"
            size="icon"
            aria-label="Edit store"
            title="Edit store"
          >
            <Link href={`/stores/${overview.storeId}/edit`}>
              <Pencil className="size-4" />
            </Link>
          </Button>
          <StoreDeleteDialog storeId={overview.storeId} storeName={overview.name} />
        </div>
      </div>

      <StoreDetailContent overview={overview} history={history} />
    </div>
  )
}
