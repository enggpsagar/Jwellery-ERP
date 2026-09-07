// FILE PATH: components/karigars/karigars-toolbar.tsx
"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Download, Search, X } from "lucide-react"
import { Loader } from "@/components/ui/loader"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
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
  const currentPageSize = searchParams.get("pageSize") ?? "10"
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
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="relative min-w-[120px] flex-1 sm:max-w-44">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, code, mobile..."
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
        <select
          className="rounded-md border px-3 py-2 text-sm"
          value={currentType}
          onChange={(e) => updateParam("type", e.target.value)}
          disabled={isPending}
        >
          <option value="ALL">All Types</option>
          {metals
            .filter((metal) => metal.isActive)
            .map((metal) => (
              <option key={metal.id} value={metal.id}>
                {metal.name}
              </option>
            ))}
          <option value={UNASSIGNED_METAL_TYPE}>Unassigned</option>
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
          title={hasSelection ? `Export selected artisans (${selectedKarigarIds.length})` : "Export artisans"}
          aria-label={hasSelection ? `Export selected artisans (${selectedKarigarIds.length})` : "Export artisans"}
        >
          {isExporting ? <Loader className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}