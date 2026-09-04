"use client"

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"

type SortableTableHeadProps = {
  label: string
  /** The exact `sortBy` value this column corresponds to server-side (must
   * match a case the page's `get*`/`getXOrderBy` action actually handles). */
  sortKey: string
  /** This table's default sort column/direction — must match the default the
   * page's own `get*` action and `DataTableToolbar`/toolbar dropdown use, so
   * a page loaded with no `sortBy` in the URL still shows the right column
   * as "active" and toggling it goes the same first direction as elsewhere. */
  defaultSortBy: string
  defaultSortOrder?: "asc" | "desc"
  align?: "left" | "right"
  className?: string
}

/**
 * Clickable <th> for server-paginated tables — the server-side counterpart to
 * reports/report-table-controls.tsx's `SortableTh` (same arrow icons, same
 * active/inactive text color convention), but wired to the `sortBy`/`sortOrder`
 * URL search params instead of local React state, since these tables sort via
 * a Prisma `orderBy` on the server rather than an in-memory array.
 *
 * Reads `useSearchParams()` directly on every render (no derived useState) so
 * it can never disagree with the URL, however it changed — a header click,
 * the existing DataTableToolbar dropdown, browser back/forward, or a manually
 * edited URL. This mirrors DataTableToolbar's own `updateParam`: switching to
 * a different column leaves `sortOrder` as whatever it already was (it does
 * not force a "first click = ascending" reset), so clicking a header and
 * picking the same column from the dropdown always land on the same state.
 */
export function SortableTableHead({
  label,
  sortKey,
  defaultSortBy,
  defaultSortOrder = "desc",
  align = "left",
  className = "",
}: SortableTableHeadProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentSortBy = searchParams.get("sortBy") ?? defaultSortBy
  const currentSortOrder = (searchParams.get("sortOrder") ?? defaultSortOrder) as "asc" | "desc"
  const isActive = currentSortBy === sortKey
  const Icon = isActive ? (currentSortOrder === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown

  const handleSort = () => {
    const params = new URLSearchParams(searchParams.toString())

    if (isActive) {
      params.set("sortOrder", currentSortOrder === "asc" ? "desc" : "asc")
    } else {
      params.set("sortBy", sortKey)
    }

    params.set("page", "1")
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <th
      className={cn(
        "px-4 py-3 font-medium",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      <button
        type="button"
        onClick={handleSort}
        className={`inline-flex items-center gap-1 hover:text-foreground ${
          isActive ? "text-foreground" : "text-muted-foreground"
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <Icon className="h-3.5 w-3.5" />
      </button>
    </th>
  )
}
