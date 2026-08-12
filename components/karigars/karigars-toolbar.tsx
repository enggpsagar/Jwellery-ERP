// FILE PATH: components/karigars/karigars-toolbar.tsx
"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Download, Loader2, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { exportKarigarsToExcel } from "@/lib/actions/karigar-actions"
import { useToast } from "@/components/providers/toast-provider"

type KarigarsToolbarProps = {
  selectedKarigarIds: string[]
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

export function KarigarsToolbar({ selectedKarigarIds }: KarigarsToolbarProps) {
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

  const [search, setSearch] = React.useState(currentSearch)
  const [isPending, startTransition] = React.useTransition()
  const [isExportingSelected, setIsExportingSelected] = React.useState(false)
  const [isExportingFiltered, setIsExportingFiltered] = React.useState(false)

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

  const handleExportSelected = async () => {
    if (!selectedKarigarIds.length) {
      toast.error("Please select at least one karigar to export.")
      return
    }

    try {
      setIsExportingSelected(true)

      const result = await exportKarigarsToExcel({
        selectedIds: selectedKarigarIds,
        sortBy: currentSortBy,
        sortOrder: currentSortOrder,
      })

      if (!result.success || !result.fileBase64 || !result.fileName) {
        toast.error(result.message || "Failed to export karigars.")
        return
      }

      downloadBase64File(result.fileBase64, result.fileName)
      toast.success(result.message || "Karigars exported successfully.")
    } catch (error) {
      console.error(error)
      toast.error("Failed to export selected karigars.")
    } finally {
      setIsExportingSelected(false)
    }
  }

  const handleExportFiltered = async () => {
    try {
      setIsExportingFiltered(true)

      const result = await exportKarigarsToExcel({
        search: currentSearch,
        sortBy: currentSortBy,
        sortOrder: currentSortOrder,
      })

      if (!result.success || !result.fileBase64 || !result.fileName) {
        toast.error(result.message || "Failed to export karigars.")
        return
      }

      downloadBase64File(result.fileBase64, result.fileName)
      toast.success(result.message || "Karigars exported successfully.")
    } catch (error) {
      console.error(error)
      toast.error("Failed to export filtered karigars.")
    } finally {
      setIsExportingFiltered(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm xl:flex-row xl:items-center xl:justify-between">
      <div className="relative w-full xl:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, code, mobile..."
          className="pl-9"
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <select
          className="rounded-md border px-3 py-2 text-sm"
          value={currentSortBy}
          onChange={(e) => updateParam("sortBy", e.target.value)}
          disabled={isPending}
        >
          <option value="createdAt">Sort by Created Date</option>
          <option value="name">Sort by Name</option>
          <option value="code">Sort by Code</option>
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
          onClick={handleExportSelected}
          disabled={isExportingSelected || isExportingFiltered}
          className="gap-2"
        >
          {isExportingSelected ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Exporting Selected...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Export Selected ({selectedKarigarIds.length})
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={handleExportFiltered}
          disabled={isExportingSelected || isExportingFiltered}
          className="gap-2"
        >
          {isExportingFiltered ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Exporting Filtered...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Export Filtered Results
            </>
          )}
        </Button>
      </div>
    </div>
  )
}