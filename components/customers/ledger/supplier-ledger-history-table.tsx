"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, Truck } from "lucide-react"

import type { SupplierLedgerEntryItem, SupplierLedgerMetal } from "@/lib/actions/customer-ledger-actions"
import { IconTooltip } from "@/components/ui/icon-tooltip"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { useWeightFormat } from "@/components/providers/weight-settings-provider"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10

function formatAmount(value: number) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

type SortKey = "entryDate" | "amount"

function MetalList({
  metals,
  weightOf,
}: {
  metals: SupplierLedgerMetal[]
  weightOf: (metal: SupplierLedgerMetal) => string
}) {
  if (metals.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <>
      {metals.map((metal) => (
        <div key={`${metal.label}|${metal.unit}`} className="whitespace-nowrap">
          {metal.label}: <span className="tabular-nums">{weightOf(metal)}</span>
        </div>
      ))}
    </>
  )
}

/**
 * A simpler twin of CustomerLedgerHistoryTable — same search + sortable-
 * column + paginate shape over SupplierLedgerEntryItem. Four columns that
 * wrap (Entry folds Type/Source/Description together, Metal lists what a
 * purchase brought in) so it fits the narrow Parties side panel; it used to
 * be five nowrap columns inside an overflow-hidden box, which pushed Amount
 * off-screen with no way to scroll to it.
 */
export function SupplierLedgerHistoryTable({ entries }: { entries: SupplierLedgerEntryItem[] }) {
  const wf = useWeightFormat()
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
        entry.description.toLowerCase().includes(query) ||
        entry.metals.some((metal) => metal.label.toLowerCase().includes(query)),
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

  const totals = useMemo(() => {
    const metals = new Map<string, SupplierLedgerMetal>()
    let owed = 0
    let paid = 0
    for (const entry of filtered) {
      if (entry.type === "CREDIT") owed += entry.amount
      else paid += entry.amount
      for (const metal of entry.metals) {
        const key = `${metal.label}|${metal.unit}`
        const existing = metals.get(key)
        if (existing) existing.weight += metal.weight
        else metals.set(key, { ...metal })
      }
    }
    return { owed, paid, metals: [...metals.values()] }
  }, [filtered])
  const balance = totals.owed - totals.paid
  const weightText = (metal: SupplierLedgerMetal) =>
    `${metal.unit === "ct" ? wf.ct(metal.weight) : wf.g(metal.weight)} ${metal.unit}`

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

      <div className="overflow-x-auto rounded-lg border">
        <Table className="min-w-[420px]">
          <TableHeader>
            <TableRow>
              <TableHead
                className="w-[92px] cursor-pointer select-none"
                onClick={() => toggleSort("entryDate")}
              >
                Date <SortIcon column="entryDate" />
              </TableHead>
              <TableHead>Metal</TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => toggleSort("amount")}
              >
                Owed <SortIcon column="amount" />
              </TableHead>
              <TableHead className="text-right">Paid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageEntries.map((entry) => (
              <TableRow key={entry.id} className="align-top">
                <TableCell className="whitespace-nowrap">
                  {/* Entry details live in the tooltip to keep the table to
                      four columns in the side panel. A button so it can be
                      focused/tapped, not only hovered. */}
                  <IconTooltip
                    label={
                      <div className="max-w-[260px] space-y-0.5">
                        <div className="font-medium">
                          {entry.amount === 0 && entry.metals.length > 0
                            ? "Metal received"
                            : entry.type === "CREDIT"
                              ? "Owed"
                              : "Paid"}{" "}
                          · {entry.sourceType}
                        </div>
                        {entry.description ? <div>{entry.description}</div> : null}
                      </div>
                    }
                  >
                    <button
                      type="button"
                      className="cursor-help underline decoration-dotted underline-offset-4"
                    >
                      {entry.entryDate}
                    </button>
                  </IconTooltip>
                </TableCell>
                <TableCell className="whitespace-normal text-sm">
                  <MetalList metals={entry.metals} weightOf={weightText} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-medium text-red-600">
                  {entry.type === "CREDIT" && entry.amount !== 0 ? (
                    formatAmount(entry.amount)
                  ) : entry.stockValue ? (
                    // Add Stock's price: shown, but not owed (not in totals).
                    <span className="font-normal text-muted-foreground" title="Stock value from Add Stock — not added to what's owed">
                      {formatAmount(entry.stockValue)}
                      <span className="block text-[10px] leading-tight">stock value · not owed</span>
                    </span>
                  ) : (
                    ""
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-medium text-emerald-600">
                  {entry.type === "DEBIT" && entry.amount !== 0 ? formatAmount(entry.amount) : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {/* Totals over every entry matching the search, all pages — not
              just the 10 rows on screen. */}
          <TableFooter>
            <TableRow className="align-top font-semibold">
              <TableCell>Total</TableCell>
              <TableCell className="whitespace-normal text-sm">
                <MetalList metals={totals.metals} weightOf={weightText} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-right text-red-600">{formatAmount(totals.owed)}</TableCell>
              <TableCell className="whitespace-nowrap text-right text-emerald-600">{formatAmount(totals.paid)}</TableCell>
            </TableRow>
            <TableRow className="font-semibold">
              <TableCell colSpan={2}>{balance >= 0 ? "Balance due" : "Advance paid"}</TableCell>
              <TableCell
                colSpan={2}
                className={cn("whitespace-nowrap text-right", balance > 0 ? "text-red-600" : balance < 0 ? "text-blue-600" : "")}
              >
                {formatAmount(Math.abs(balance))}
              </TableCell>
            </TableRow>
          </TableFooter>
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
