"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Download, Search } from "lucide-react"
import { Loader } from "@/components/ui/loader"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/providers/toast-provider"
import { downloadBase64File } from "@/lib/download-file"

export type DataTableExportParams = {
  selectedIds?: string[]
  search?: string
  sortBy?: string
  sortOrder?: "asc" | "desc"
  status?: string
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
  /** Omit when this table has no row-select — the single Export button then always exports the filtered set. */
  selectedIds?: string[]
  entityLabel: string
  exportAction: (params: DataTableExportParams) => Promise<DataTableExportResult>
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
  selectedIds,
  entityLabel,
  exportAction,
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
   * One button instead of two separate "Export Selected"/"Export Filtered
   * Results" actions — it exports the current selection when there is one,
   * otherwise everything matching the current search/sort/status. Selecting
   * rows is already how a user narrows an export, so a second button for
   * the unfiltered case was a distinction without a difference.
   */
  const handleExport = async () => {
    try {
      setIsExporting(true)

      const result = await exportAction(
        hasSelection
          ? { selectedIds, sortBy: currentSortBy, sortOrder: currentSortOrder }
          : {
              search: currentSearch,
              sortBy: currentSortBy,
              sortOrder: currentSortOrder,
              status: currentStatus !== "ALL" ? currentStatus : undefined,
            },
      )

      if (!result.success || !result.fileBase64 || !result.fileName) {
        toast.error(result.message || `Failed to export ${entityLabel}.`)
        return
      }

      downloadBase64File(result.fileBase64, result.fileName)
      toast.success(result.message || `${entityLabel} exported successfully.`)
    } catch (error) {
      console.error(error)
      toast.error(`Failed to export ${entityLabel}.`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm xl:flex-row xl:items-center xl:justify-between">
      <div className="relative w-full xl:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
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

        <Button
          type="button"
          variant="outline"
          onClick={handleExport}
          disabled={isExporting}
          className="gap-2"
        >
          {isExporting ? (
            <>
              <Loader className="h-4 w-4" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              {hasSelection ? `Export Selected (${selectedIds!.length})` : "Export"}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
