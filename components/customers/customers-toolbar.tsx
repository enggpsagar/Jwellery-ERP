"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Download, Search, X } from "lucide-react"
import { Loader } from "@/components/ui/loader"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { exportCustomersToExcel } from "@/lib/actions/customer-actions"
import { useToast } from "@/components/providers/toast-provider"

type CustomersToolbarProps = {
  selectedCustomerIds: string[]
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

export function CustomersToolbar({
  selectedCustomerIds,
  bulkActions,
}: CustomersToolbarProps) {
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

  const hasSelection = selectedCustomerIds.length > 0

  /**
   * One button instead of two: exports the current selection when there is
   * one, otherwise everything matching the current search/sort. Selecting
   * rows is already how a user narrows an export.
   */
  const handleExport = async () => {
    try {
      setIsExporting(true)

      const result = await exportCustomersToExcel(
        hasSelection
          ? { selectedIds: selectedCustomerIds, sortBy: currentSortBy, sortOrder: currentSortOrder }
          : { search: currentSearch, sortBy: currentSortBy, sortOrder: currentSortOrder },
      )

      if (!result.success || !result.fileBase64 || !result.fileName) {
        toast.error(result.message || "Failed to export customers.")
        return
      }

      downloadBase64File(result.fileBase64, result.fileName)
      toast.success(result.message || "Customers exported successfully.")
    } catch (error) {
      console.error(error)
      toast.error("Failed to export customers.")
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, email, city..."
          className="pl-9 pr-8"
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
      </div>

      <div className="flex items-center gap-3">
        {bulkActions}

        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={handleExport}
          disabled={isExporting}
          title={hasSelection ? `Export selected customers (${selectedCustomerIds.length})` : "Export customers"}
          aria-label={hasSelection ? `Export selected customers (${selectedCustomerIds.length})` : "Export customers"}
        >
          {isExporting ? <Loader className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}