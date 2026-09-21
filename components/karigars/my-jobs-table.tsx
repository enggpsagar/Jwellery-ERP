"use client"

import { Badge } from "@/components/ui/badge"
import { formatShortDate, cn } from "@/lib/utils"
import type { MyJobRow } from "@/lib/actions/my-jobs-actions"

type MyJobsTableProps = {
  jobs: MyJobRow[]
  activeJobId: string | null
  onActivate: (id: string) => void
}

/**
 * Left-hand list of the My Jobs master-detail layout — read-only (no
 * selection/bulk actions/delete, unlike DraftOrdersTable): a karigar can
 * only ever view their own jobs, never modify them from here.
 */
export function MyJobsTable({ jobs, activeJobId, onActivate }: MyJobsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Job No.</th>
              <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Item</th>
              <th className="px-4 py-3 text-left font-medium">Issued</th>
              <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Issue Weight</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>

          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No jobs assigned to you yet.
                </td>
              </tr>
            ) : (
              jobs.map((job) => {
                const isActive = activeJobId === job.id
                return (
                  <tr
                    key={job.id}
                    onClick={() => onActivate(job.id)}
                    className={cn(
                      "cursor-pointer border-b last:border-0 hover:bg-muted/20",
                      isActive && "bg-accent",
                    )}
                  >
                    <td className="px-4 py-3 font-medium">{job.jobNumber ?? "-"}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {job.itemLabel ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatShortDate(job.issueDate)}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {job.issueWeight ? `${job.issueWeight} g` : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{job.status}</Badge>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
