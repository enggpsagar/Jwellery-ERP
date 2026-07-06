"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"

type CustomersPaginationProps = {
  page: number
  totalPages: number
  totalCount: number
  pageSize: number
}

export function CustomersPagination({
  page,
  totalPages,
  totalCount,
  pageSize,
}: CustomersPaginationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", String(nextPage))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalCount)

  return (
    <div className="flex flex-col gap-3 rounded-b-xl border-t bg-gray-50 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
      <p className="text-gray-600">
        Showing <span className="font-medium">{start}</span> to{" "}
        <span className="font-medium">{end}</span> of{" "}
        <span className="font-medium">{totalCount}</span> customers
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => goToPage(page - 1)}
        >
          Previous
        </Button>

        <span className="px-2 text-sm text-gray-600">
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