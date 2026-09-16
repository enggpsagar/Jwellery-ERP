"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type DataTablePaginationProps = {
  page: number
  totalPages: number
  totalCount: number
  pageSize: number
  itemLabel: string
  /** Renders the "N / page" selector in this footer instead of relying on
   * DataTableToolbar to show it up top (pair with that component's own
   * hidePageSize) — opt-in so every existing caller's toolbar-hosted
   * selector keeps working unchanged. */
  showPageSizeSelector?: boolean
  pageSizeOptions?: string[]
}

const DEFAULT_PAGE_SIZE_OPTIONS = ["10", "20", "50"]

/** Generic URL-param-driven Prev/Next pagination footer, shared across every data table. */
export function DataTablePagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  itemLabel,
  showPageSizeSelector = false,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: DataTablePaginationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", String(nextPage))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function changePageSize(nextSize: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("pageSize", nextSize)
    params.set("page", "1")
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalCount)

  return (
    <div className="grid grid-cols-1 items-center gap-3 rounded-b-xl border-t bg-muted/40 px-4 py-3 text-sm md:grid-cols-[1fr_auto_1fr]">
      <p className="text-muted-foreground md:justify-self-start">
        Showing <span className="font-medium">{start}</span> to{" "}
        <span className="font-medium">{end}</span> of{" "}
        <span className="font-medium">{totalCount}</span> {itemLabel}
      </p>

      <div className="flex items-center gap-2 md:justify-self-center">
        {showPageSizeSelector ? (
          <Select value={String(pageSize)} onValueChange={changePageSize}>
            <SelectTrigger className="h-8 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="flex items-center gap-2 md:justify-self-end">
        <Button variant="outline" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
          Previous
        </Button>

        <span className="px-2 text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>

        <Button
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => goToPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
