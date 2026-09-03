"use client"

// Generic client-side search + sort + pagination over a report's already
// date-ranged rows. Reports here return a full (but date-bounded) result
// set from the server rather than a paged one — refetching per keystroke or
// per page click would be needless round-trips for data that's already sitting
// in memory, so search/sort/paging just operate on the array in place.

import { useMemo, useState } from "react"

type SortDirection = "asc" | "desc"

export type UseReportTableOptions<T> = {
  /** Flattened searchable text for a row — checked as a single
   * case-insensitive substring match against the search box. */
  searchText: (row: T) => string
  /** Value to compare for a given sort key; omit a key from your switch and
   * it simply won't be sortable. Returning null sorts that row last. */
  getSortValue?: (row: T, key: string) => string | number | null
  defaultSortKey?: string
  defaultSortDir?: SortDirection
  pageSize?: number
}

export function useReportTable<T>(rows: T[], options: UseReportTableOptions<T>) {
  const { searchText, getSortValue, defaultSortKey, defaultSortDir = "desc", pageSize = 25 } = options

  const [search, setSearchState] = useState("")
  const [sort, setSort] = useState<{ key: string | undefined; dir: SortDirection }>({
    key: defaultSortKey,
    dir: defaultSortDir,
  })
  const [page, setPage] = useState(1)
  const sortKey = sort.key
  const sortDir = sort.dir

  function setSearch(value: string) {
    setSearchState(value)
    setPage(1)
  }

  function toggleSort(key: string) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    )
    setPage(1)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => searchText(row).toLowerCase().includes(q))
  }, [rows, search, searchText])

  const sorted = useMemo(() => {
    if (!sortKey || !getSortValue) return filtered
    const withValue = filtered.map((row) => ({ row, value: getSortValue(row, sortKey) }))
    withValue.sort((a, b) => {
      if (a.value == null && b.value == null) return 0
      if (a.value == null) return 1
      if (b.value == null) return -1
      if (typeof a.value === "number" && typeof b.value === "number") {
        return sortDir === "asc" ? a.value - b.value : b.value - a.value
      }
      const cmp = String(a.value).localeCompare(String(b.value))
      return sortDir === "asc" ? cmp : -cmp
    })
    return withValue.map((entry) => entry.row)
  }, [filtered, sortKey, sortDir, getSortValue])

  const totalCount = sorted.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  )

  return {
    search,
    setSearch,
    sortKey,
    sortDir,
    toggleSort,
    page: safePage,
    setPage,
    pageRows,
    totalPages,
    totalCount,
    rawCount: rows.length,
    pageSize,
  }
}

export type ReportTableState<T> = ReturnType<typeof useReportTable<T>>
