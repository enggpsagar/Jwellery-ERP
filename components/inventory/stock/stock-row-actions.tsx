"use client"

import Link from "next/link"
import { Eye, Pencil } from "lucide-react"

type StockRowActionsProps = {
  stockId: string
}

/**
 * View + Edit for a single stock item — factored out of StockTable's old
 * inline row actions (moved to the detail panel, same dedup already done
 * for Products/Customers). Stock has no per-row delete today (there's only
 * bulk delete from the list toolbar) and no per-row permission gate either —
 * this mirrors that unconditioned behavior rather than inventing a new one.
 */
export function StockRowActions({ stockId }: StockRowActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/inventory/stock/${stockId}`}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
        title="View stock item"
      >
        <Eye className="h-4 w-4" />
      </Link>

      <Link
        href={`/inventory/stock/${stockId}/edit`}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-indigo-600 hover:bg-indigo-50"
        title="Edit stock item"
      >
        <Pencil className="h-4 w-4" />
      </Link>
    </div>
  )
}
