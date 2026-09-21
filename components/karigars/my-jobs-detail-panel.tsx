"use client"

import { useEffect, useState } from "react"
import { ClipboardList } from "lucide-react"

import { getMyJobById, type MyJobDetail } from "@/lib/actions/my-jobs-actions"
import { MyJobDetailContent } from "@/components/karigars/my-job-detail-content"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Right-hand pane of the My Jobs master-detail layout — same convention as
 * DraftOrderDetailPanel: fetches on activeJobId change, shows exactly what
 * the standalone /my-jobs/[id] page shows via the shared MyJobDetailContent.
 */
export function MyJobsDetailPanel({ jobId }: { jobId: string | null }) {
  const [job, setJob] = useState<MyJobDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!jobId) {
      setJob(null)
      return
    }

    let cancelled = false
    setLoading(true)
    getMyJobById(jobId)
      .then((result) => {
        if (!cancelled) setJob(result)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [jobId])

  if (!jobId) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <ClipboardList className="h-8 w-8" />
        <p className="text-sm">Select a job to view its details.</p>
      </div>
    )
  }

  if (loading || !job) {
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
        <h2 className="text-lg font-semibold">{job.jobNumber ?? "Job"}</h2>
        <Badge variant="outline">{job.status}</Badge>
      </div>

      <MyJobDetailContent job={job} />
    </div>
  )
}
