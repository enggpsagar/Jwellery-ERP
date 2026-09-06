import type { Metadata } from "next"
import { cache } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"

import {
  getStorePlanHistory,
  getStorePlanOverview,
} from "@/lib/actions/store-plan-actions"
import { Button } from "@/components/ui/button"
import { PlanStatusPill } from "@/components/stores/plan-presentation"
import { StoreDetailContent } from "@/components/stores/store-detail-content"

/**
 * One store's subscription record in full: where it stands now, and every
 * plan period it has ever been on.
 *
 * Super Admin only, enforced in the query layer (requireRole) as well as by
 * the middleware rule on /stores — this page is one reader of that data, not
 * the thing that guards it.
 */

type StoreDetailPageProps = {
  params: Promise<{ id: string }>
}

const getStoreOverview = cache(getStorePlanOverview)

export async function generateMetadata({
  params,
}: StoreDetailPageProps): Promise<Metadata> {
  try {
    const { id } = await params
    const overview = await getStoreOverview(id)
    return { title: overview?.name ?? "Store" }
  } catch {
    return { title: "Store" }
  }
}

export default async function StoreDetailPage({ params }: StoreDetailPageProps) {
  const { id } = await params

  const [overview, history] = await Promise.all([
    getStoreOverview(id),
    getStorePlanHistory(id),
  ])

  if (!overview) notFound()

  return (
    <main className="space-y-6 p-6">
      <div className="space-y-3">
        <Link
          href="/stores"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Stores
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {overview.name}
              </h1>
              <PlanStatusPill status={overview.status} />
            </div>
            <p className="font-mono text-sm text-muted-foreground">
              {overview.code}
            </p>
          </div>

          <Button asChild variant="outline" className="gap-2">
            <Link href={`/stores/${overview.storeId}/edit`}>
              <Pencil className="size-4" />
              Edit store
            </Link>
          </Button>
        </div>
      </div>

      <StoreDetailContent overview={overview} history={history} />
    </main>
  )
}
