"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Download, Search, X } from "lucide-react"
import { Loader } from "@/components/ui/loader"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/providers/toast-provider"
import { downloadBase64File } from "@/lib/download-file"

export type DataTableExportFormat = "csv" | "xlsx" | "pdf"

export type DataTableExportParams = {
  selectedIds?: string[]
  search?: string
  sortBy?: string
  sortOrder?: "asc" | "desc"
  status?: string
  type?: string
  format?: DataTableExportFormat
}

export type DataTableExportResult = {
  success: boolean
  message: string
  fileName?: string
  fileBase64?: string
}

type Option = { value: string; label: string }

type DataTableToolbarProps = {
  searchPlaceholder: string
  sortOptions: Option[]
  defaultSortBy: string
  defaultSortOrder?: "asc" | "desc"
  statusOptions?: Option[]
  /** A second, independent filter dropdown next to Status — e.g. Stock/
   * Karigar's Gold/Silver/Diamond/Stone/Other Type filter. Kept as its own
   * prop/URL param ("type") rather than reusing statusOptions, since a table
   * can have a real Status field (InventoryStockStatus) that's a genuinely
   * different concept from this metal-family classification. */
  typeOptions?: Option[]
  typeLabel?: string
  /** Hides the "Sort by …" and Ascending/Descending dropdowns — for a table
   * (Products, Stock) that sorts only via its own per-column
   * SortableTableHead clicks and doesn't want a second, redundant sort
   * control in the toolbar. Defaults to false so every existing caller keeps
   * both dropdowns exactly as before. */
  hideSort?: boolean
  /** Omit when this table has no row-select — the single Export button then always exports the filtered set. */
  selectedIds?: string[]
  entityLabel: string
  exportAction: (params: DataTableExportParams) => Promise<DataTableExportResult>
  /** BulkDeleteButton, rendered inside this same bordered bar (next to
   * Export) instead of as a separate floating box beside it — it already
   * renders nothing when nothing is selected, so this slot is simply empty
   * until a row is ticked. */
  bulkActions?: React.ReactNode
}

/**
 * Generic search+sort+page-size+status-filter+export toolbar, URL-param-driven
 * (search/sortBy/sortOrder/pageSize/status/page), shared across every data table
 * in the app. Mirrors the pattern hand-duplicated in customers-toolbar.tsx/
 * vendors-toolbar.tsx/karigars-toolbar.tsx — those three are left as-is since
 * they already work; every new list page should use this instead of adding a
 * fourth+ near-identical copy.
 */
export function DataTableToolbar({
  searchPlaceholder,
  sortOptions,
  defaultSortBy,
  defaultSortOrder = "desc",
  statusOptions,
  typeOptions,
  typeLabel = "Type",
  hideSort = false,
  selectedIds,
  entityLabel,
  exportAction,
  bulkActions,
}: DataTableToolbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const toast = useToast()

  const currentSearch = searchParams.get("search") ?? ""
  const currentSortBy = searchParams.get("sortBy") ?? defaultSortBy
  const currentSortOrder = (searchParams.get("sortOrder") ?? defaultSortOrder) as "asc" | "desc"
  const currentPageSize = searchParams.get("pageSize") ?? "10"
  const currentStatus = searchParams.get("status") ?? "ALL"
  const currentType = searchParams.get("type") ?? "ALL"

  const [search, setSearch] = React.useState(currentSearch)
  const [isPending, startTransition] = React.useTransition()
  const [isExporting, setIsExporting] = React.useState(false)

  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (search.trim() === currentSearch.trim()) return

      startTransition(() => {
        const params = new URLSearchParams(searchParams.toString())

        if (search.trim()) {
          params.set("search", search.trim())
        } else {
          params.delete("search")
        }

        params.set("page", "1")
        router.replace(`${pathname}?${params.toString()}`)
      })
    }, 500)

    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, currentSearch, pathname, router])

  const updateParam = (key: string, value: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())

      if (value && value !== "ALL") {
        params.set(key, value)
      } else {
        params.delete(key)
      }

      params.set("page", "1")
      router.replace(`${pathname}?${params.toString()}`)
    })
  }

  const hasSelection = !!selectedIds && selectedIds.length > 0

  /**
   * One menu instead of two separate "Export Selected"/"Export Filtered
   * Results" actions — it exports the current selection when there is one,
   * otherwise everything matching the current search/sort/status. Selecting
   * rows is already how a user narrows an export, so a second button for
   * the unfiltered case was a distinction without a difference. The format
   * choice (CSV/Excel) is the only other decision left, hence the dropdown.
   */
  const handleExport = async (format: DataTableExportFormat) => {
    try {
      setIsExporting(true)

      const result = await exportAction(
        hasSelection
          ? { selectedIds, sortBy: currentSortBy, sortOrder: currentSortOrder, format }
          : {
              search: currentSearch,
              sortBy: currentSortBy,
              sortOrder: currentSortOrder,
              status: currentStatus !== "ALL" ? currentStatus : undefined,
              type: currentType !== "ALL" ? currentType : undefined,
              format,
            },
      )

      if (!result.success || !result.fileBase64 || !result.fileName) {
        toast.error(result.message || `Failed to export ${entityLabel}.`)
        return
      }

      downloadBase64File(
        result.fileBase64,
        result.fileName,
        format === "csv"
          ? "text/csv"
          : format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      toast.success(result.message || `${entityLabel} exported successfully.`)
    } catch (error) {
      console.error(error)
      toast.error(`Failed to export ${entityLabel}.`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9 pr-8"
          disabled={isPending}
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title="Clear search"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-3">
        {statusOptions ? (
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={currentStatus}
            onChange={(e) => updateParam("status", e.target.value)}
            disabled={isPending}
          >
            <option value="ALL">All Statuses</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}

        {typeOptions ? (
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={currentType}
            onChange={(e) => updateParam("type", e.target.value)}
            disabled={isPending}
          >
            <option value="ALL">All {typeLabel}s</option>
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}

        {hideSort ? null : (
          <>
            <select
              className="rounded-md border px-3 py-2 text-sm"
              value={currentSortBy}
              onChange={(e) => updateParam("sortBy", e.target.value)}
              disabled={isPending}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              className="rounded-md border px-3 py-2 text-sm"
              value={currentSortOrder}
              onChange={(e) => updateParam("sortOrder", e.target.value)}
              disabled={isPending}
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </>
        )}

        <select
          className="rounded-md border px-3 py-2 text-sm"
          value={currentPageSize}
          onChange={(e) => updateParam("pageSize", e.target.value)}
          disabled={isPending}
        >
          <option value="10">10 / page</option>
          <option value="20">20 / page</option>
          <option value="50">50 / page</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        {bulkActions}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={isExporting}
              title={hasSelection ? `Export selected ${entityLabel} (${selectedIds!.length})` : `Export ${entityLabel}`}
              aria-label={hasSelection ? `Export selected ${entityLabel} (${selectedIds!.length})` : `Export ${entityLabel}`}
              className="border-transparent bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
            >
              {isExporting ? <Loader className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport("csv")}>CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("xlsx")}>Excel</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("pdf")}>PDF</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
