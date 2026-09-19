"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Download, X } from "lucide-react"
import { Loader } from "@/components/ui/loader"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { CollapsibleSearch } from "@/components/shared/collapsible-search"
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
          : {
              search: currentSearch,
              sortBy: currentSortBy,
              sortOrder: currentSortOrder,
              dateFrom: currentDateFrom || undefined,
              dateTo: currentDateTo || undefined,
            },
      )

      if (!result.success || !result.fileBase64 || !result.fileName) {
        toast.error(result.message || "Failed to export parties.")
        return
      }

      downloadBase64File(result.fileBase64, result.fileName)
      toast.success(result.message || "Parties exported successfully.")
    } catch (error) {
      console.error(error)
      toast.error("Failed to export parties.")
    } finally {
      setIsExporting(false)
    }
  }

  return (
    // Column stack below sm, not just flex-wrap on one row — same fix as
    // DataTableToolbar's own (see its comment): flex-wrap alone only moves
    // the whole filters group once it runs out of room next to the search
    // box, squeezing every control together first instead of each getting
    // its own line.
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
      <CollapsibleSearch
        value={search}
        onChange={setSearch}
        placeholder="Search by name, phone, email, city..."
      />

      <div className="flex flex-1 flex-wrap items-center gap-3">
        {/* Sort by / Ascending-Descending dropdowns removed — redundant
            with the table's own clickable column headers (Party Name,
            Opening Balance, ...), which already drive sortBy/sortOrder via
            SortableTableHead, and were extra clutter in an already-tight
            toolbar (especially on mobile). currentSortBy/currentSortOrder
            stay read (below and in handleExport) so an export still
            respects whatever sort a column header click has set. */}
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
          title={hasSelection ? `Export selected parties (${selectedCustomerIds.length})` : "Export parties"}
          aria-label={hasSelection ? `Export selected parties (${selectedCustomerIds.length})` : "Export parties"}
          className="shadow-sm"
        >
          {isExporting ? <Loader className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}