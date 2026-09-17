"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, Truck } from "lucide-react"

import type { SupplierLedgerEntryItem } from "@/lib/actions/customer-ledger-actions"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10

function formatAmount(value: number) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

type SortKey = "entryDate" | "amount"

/**
 * A much simpler twin of CustomerLedgerHistoryTable — no metal/weight
 * columns, no invoice/credit-note links, since Purchases/Payment Out never
 * track non-money units or link to those document types. Same search +
 * sortable-column + paginate shape, just over SupplierLedgerEntryItem's
 * smaller field set.
 */
export function SupplierLedgerHistoryTable({ entries }: { entries: SupplierLedgerEntryItem[] }) {
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("entryDate")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return entries
    return entries.filter(
      (entry) =>
        entry.sourceType.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query),
    )
  }, [entries, search])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1
      if (sortKey === "amount") return (a.amount - b.amount) * dir
      return (a.entryDateISO.localeCompare(b.entryDateISO)) * dir
    })
    return copy
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageEntries = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
    setPage(1)
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
        <Truck className="h-6 w-6 opacity-50" />
        No supplier activity recorded yet.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search by source or description..."
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
          setPage(1)
        }}
        className="max-w-xs"
      />

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("entryDate")}
              >
                Date <SortIcon column="entryDate" />
              </TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Description</TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => toggleSort("amount")}
              >
                Amount <SortIcon column="amount" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageEntries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{entry.entryDate}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      entry.type === "CREDIT" ? "text-red-600" : "text-emerald-600",
                    )}
                  >
                    {entry.type === "CREDIT" ? "Owed" : "Paid"}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{entry.sourceType}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{entry.description || "-"}</TableCell>
                <TableCell className="text-right font-medium">{formatAmount(entry.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
