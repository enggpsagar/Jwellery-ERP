// FILE PATH: components/karigars/karigars-toolbar.tsx
"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Download, X } from "lucide-react"
import { Loader } from "@/components/ui/loader"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { CollapsibleSearch } from "@/components/shared/collapsible-search"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { exportKarigarsToExcel } from "@/lib/actions/karigar-actions"
import { useToast } from "@/components/providers/toast-provider"
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions"
import { UNASSIGNED_METAL_TYPE } from "@/lib/business-units"

type KarigarsToolbarProps = {
  selectedKarigarIds: string[]
  /** The store's own configured metals/stones (Settings > Taxonomy) — the
   * Type filter's options come directly from this list, so a metal added
   * there shows up here with no code change. */
  metals: StoreMetalRow[]
  /** BulkDeleteButton, rendered inside this same bordered bar (next to
   * Export) instead of as a separate floating box beside it — it already
   * renders nothing when nothing is selected, so this slot is simply empty
   * until a row is ticked. */
  bulkActions?: React.ReactNode
}

function downloadBase64File(base64: string, fileName: string) {
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }

  const byteArray = new Uint8Array(byteNumbers)
  const blob = new Blob([byteArray], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })

  const url = window.URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export function KarigarsToolbar({ selectedKarigarIds, metals, bulkActions }: KarigarsToolbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const toast = useToast()

  const currentSearch = searchParams.get("search") ?? ""
  const currentSortBy = (searchParams.get("sortBy") ?? "createdAt") as
    | "name"
    | "code"
    | "createdAt"
  const currentSortOrder = (searchParams.get("sortOrder") ?? "desc") as
    | "asc"
    | "desc"
  const currentType = searchParams.get("type") ?? "ALL"
  const currentDateFrom = searchParams.get("dateFrom") ?? ""
  const currentDateTo = searchParams.get("dateTo") ?? ""

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
  }, [search, currentSearch, pathname, router, searchParams])

  const updateParam = (key: string, value: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())

      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }

      params.set("page", "1")
      router.replace(`${pathname}?${params.toString()}`)
    })
  }

  // Sets dateFrom/dateTo together in one navigation — two separate
  // updateParam calls back-to-back would each build off the same
  // pre-navigation searchParams snapshot and clobber each other.
  const updateDateRange = (from: string, to: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())

      if (from) {
        params.set("dateFrom", from)
      } else {
        params.delete("dateFrom")
      }

      if (to) {
        params.set("dateTo", to)
      } else {
        params.delete("dateTo")
      }

      params.set("page", "1")
      router.replace(`${pathname}?${params.toString()}`)
    })
  }

  const hasSelection = selectedKarigarIds.length > 0

  /**
   * One button instead of two: exports the current selection when there is
   * one, otherwise everything matching the current search/sort. Selecting
   * rows is already how a user narrows an export.
   */
  const handleExport = async () => {
    try {
      setIsExporting(true)

      const result = await exportKarigarsToExcel(
        hasSelection
          ? { selectedIds: selectedKarigarIds, sortBy: currentSortBy, sortOrder: currentSortOrder }
          : {
              search: currentSearch,
              sortBy: currentSortBy,
              sortOrder: currentSortOrder,
              type: currentType !== "ALL" ? currentType : undefined,
              dateFrom: currentDateFrom || undefined,
              dateTo: currentDateTo || undefined,
            },
      )

      if (!result.success || !result.fileBase64 || !result.fileName) {
        toast.error(result.message || "Failed to export artisans.")
        return
      }

      downloadBase64File(result.fileBase64, result.fileName)
      toast.success(result.message || "Artisans exported successfully.")
    } catch (error) {
      console.error(error)
      toast.error("Failed to export artisans.")
    } finally {
      setIsExporting(false)
    }
  }

  return (
    // Column stack below sm — same fix as DataTableToolbar/CustomersToolbar/VendorsToolbar.
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
      <CollapsibleSearch
        value={search}
        onChange={setSearch}
        placeholder="Search by name, code, mobile..."
        disabled={isPending}
      />

      <div className="flex flex-1 flex-wrap items-center gap-3">
        <Select value={currentType} onValueChange={(value) => updateParam("type", value)} disabled={isPending}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            {metals
              .filter((metal) => metal.isActive)
              .map((metal) => (
                <SelectItem key={metal.id} value={metal.id}>
                  {metal.name}
                </SelectItem>
              ))}
            <SelectItem value={UNASSIGNED_METAL_TYPE}>Unassigned</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <DateRangePicker
            value={{ from: currentDateFrom, to: currentDateTo }}
            onChange={({ from, to }) => updateDateRange(from, to)}
            placeholder="Added"
            disabled={isPending}
            className="w-[190px]"
          />
          {currentDateFrom || currentDateTo ? (
            <button
              type="button"
              onClick={() => {
                startTransition(() => {
                  const params = new URLSearchParams(searchParams.toString())
                  params.delete("dateFrom")
                  params.delete("dateTo")
                  params.set("page", "1")
                  router.replace(`${pathname}?${params.toString()}`)
                })
              }}
              className="text-muted-foreground hover:text-foreground"
              title="Clear date range"
              aria-label="Clear date range"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {bulkActions}

        <Button
          type="button"
          variant="export"
          size="icon"
          onClick={handleExport}
          disabled={isExporting}
          title={hasSelection ? `Export selected artisans (${selectedKarigarIds.length})` : "Export artisans"}
          aria-label={hasSelection ? `Export selected artisans (${selectedKarigarIds.length})` : "Export artisans"}
          className="shadow-sm"
        >
          {isExporting ? <Loader className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}