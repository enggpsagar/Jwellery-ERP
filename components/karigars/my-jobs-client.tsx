"use client"

import * as React from "react"

import { MyJobsTable } from "@/components/karigars/my-jobs-table"
import { MyJobsDetailPanel } from "@/components/karigars/my-jobs-detail-panel"
import type { MyJobRow } from "@/lib/actions/my-jobs-actions"

/**
 * Master-detail layout for the artisan-facing My Jobs page — list on the
 * left, full detail on the right, same treatment already given to Draft
 * Orders/Customers/Vendors/Purchases/Billing/Quotations.
 */
export function MyJobsClient({ jobs }: { jobs: MyJobRow[] }) {
  // Defaults to the first row so the panel is never empty — matching every
  // other master-detail list in the app.
  const [activeJobId, setActiveJobId] = React.useState<string | null>(jobs[0]?.id ?? null)

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-start">
      <MyJobsTable jobs={jobs} activeJobId={activeJobId} onActivate={setActiveJobId} />
      <MyJobsDetailPanel jobId={activeJobId} />
    </div>
  )
}
