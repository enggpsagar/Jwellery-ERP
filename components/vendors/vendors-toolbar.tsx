"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Download, Search, X } from "lucide-react"
import { Loader } from "@/components/ui/loader"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { exportVendorsToExcel, type VendorSortBy } from "@/lib/actions/vendor-actions"
import { useToast } from "@/components/providers/toast-provider"

type VendorsToolbarProps = {
  selectedVendorIds: string[]
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

export function VendorsToolbar({
  selectedVendorIds,
  bulkActions,
}: VendorsToolbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const toast = useToast()

  const currentSearch = searchParams.get("search") ?? ""
  const currentSortBy = (searchParams.get("sortBy") ?? "createdAt") as VendorSortBy
  const currentSortOrder = (searchParams.get("sortOrder") ?? "desc") as
    | "asc"
    | "desc"
  const currentPageSize = searchParams.get("pageSize") ?? "10"
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

  const hasSelection = selectedVendorIds.length > 0

  /**
   * One button instead of two: exports the current selection when there is
   * one, otherwise everything matching the current search/sort. Selecting
   * rows is already how a user narrows an export.
   */
  const handleExport = async () => {
    try {
      setIsExporting(true)

      const result = await exportVendorsToExcel(
        hasSelection
          ? { selectedIds: selectedVendorIds, sortBy: currentSortBy, sortOrder: currentSortOrder }
          : {
              search: currentSearch,
              sortBy: currentSortBy,
              sortOrder: currentSortOrder,
              dateFrom: currentDateFrom || undefined,
              dateTo: currentDateTo || undefined,
            },
      )

      if (!result.success || !result.fileBase64 || !result.fileName) {
        toast.error(result.message || "Failed to export vendors.")
        return
      }

      downloadBase64File(result.fileBase64, result.fileName)
      toast.success(result.message || "Vendors exported successfully.")
    } catch (error) {
      console.error(error)
      toast.error("Failed to export vendors.")
    } finally {
      setIsExporting(false)
    }
  }

  return (
    // Column stack below sm — same fix as DataTableToolbar/CustomersToolbar.
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, email, city..."
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
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-muted-foreground">Added</span>
          <input
            type="date"
            aria-label="Added from"
            className="rounded-md border px-3 py-2 text-sm"
            value={currentDateFrom}
            max={currentDateTo || undefined}
            onChange={(e) => updateParam("dateFrom", e.target.value)}
            disabled={isPending}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <input
            type="date"
            aria-label="Added to"
            className="rounded-md border px-3 py-2 text-sm"
            value={currentDateTo}
            min={currentDateFrom || undefined}
            onChange={(e) => updateParam("dateTo", e.target.value)}
            disabled={isPending}
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

        <Button
          type="button"
          variant="export"
          size="icon"
          onClick={handleExport}
          disabled={isExporting}
          title={hasSelection ? `Export selected vendors (${selectedVendorIds.length})` : "Export vendors"}
          aria-label={hasSelection ? `Export selected vendors (${selectedVendorIds.length})` : "Export vendors"}
          className="shadow-sm"
        >
          {isExporting ? <Loader className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
