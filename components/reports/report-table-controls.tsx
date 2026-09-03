"use client"

import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type ReportSearchBarProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** "12 of 340" style summary shown beside the box. */
  resultSummary?: string
}

export function ReportSearchBar({ value, onChange, placeholder, resultSummary }: ReportSearchBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Search..."}
          className="h-9 pl-8"
        />
      </div>
      {resultSummary && (
        <p className="text-xs text-muted-foreground">{resultSummary}</p>
      )}
    </div>
  )
}

type SortableThProps = {
  label: string
  sortKey: string
  activeSortKey: string | undefined
  sortDir: "asc" | "desc"
  onSort: (key: string) => void
  align?: "left" | "right"
  className?: string
}

/** A <th> that toggles sort on click and shows which direction is active —
 * used in place of a plain <th> for any column worth sorting by. */
export function SortableTh({
  label,
  sortKey,
  activeSortKey,
  sortDir,
  onSort,
  align = "left",
  className = "",
}: SortableThProps) {
  const isActive = activeSortKey === sortKey
  const Icon = isActive ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <th className={`px-4 py-3 font-medium ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
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

type ReportPaginationProps = {
  page: number
  totalPages: number
  totalCount: number
  pageSize: number
  onPageChange: (page: number) => void
}

export function ReportPagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
}: ReportPaginationProps) {
  if (totalCount === 0) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalCount)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
      <p className="text-xs text-muted-foreground">
        Showing {start} to {end} of {totalCount}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
