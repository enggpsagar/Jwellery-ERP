"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Download, Search, X } from "lucide-react"
import { Loader } from "@/components/ui/loader"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { exportVendorsToExcel } from "@/lib/actions/vendor-actions"
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
  const currentSortBy = (searchParams.get("sortBy") ?? "createdAt") as
    | "name"
    | "createdAt"
    | "openingBalance"
  const currentSortOrder = (searchParams.get("sortOrder") ?? "desc") as
    | "asc"
    | "desc"
  const currentPageSize = searchParams.get("pageSize") ?? "10"

  const [search, setSearch] = React.useState(currentSearch)
  // Collapsed to an icon by default, expanding into the input on click —
  // starts expanded when a search is already active (URL/back-nav), so an
  // in-progress filter is never hidden behind an icon.
  const [searchOpen, setSearchOpen] = React.useState(!!currentSearch)
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
          : { search: currentSearch, sortBy: currentSortBy, sortOrder: currentSortOrder },
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
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      {searchOpen ? (
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => {
              if (!search.trim()) setSearchOpen(false)
            }}
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
      ) : (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setSearchOpen(true)}
          title="Search"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </Button>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded-md border px-3 py-2 text-sm"
          value={currentSortBy}
          onChange={(e) => updateParam("sortBy", e.target.value)}
          disabled={isPending}
        >
          <option value="createdAt">Sort by Created Date</option>
          <option value="name">Sort by Name</option>
          <option value="openingBalance">Sort by Opening Balance</option>
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
          size="icon"
          onClick={handleExport}
          disabled={isExporting}
          title={hasSelection ? `Export selected vendors (${selectedVendorIds.length})` : "Export vendors"}
          aria-label={hasSelection ? `Export selected vendors (${selectedVendorIds.length})` : "Export vendors"}
        >
          {isExporting ? <Loader className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        </Button>

        {bulkActions}
      </div>
    </div>
  )
}
