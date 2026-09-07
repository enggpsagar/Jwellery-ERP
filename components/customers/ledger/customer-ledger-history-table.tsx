"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ArrowUpDown, Receipt, Search } from "lucide-react"

import type { CustomerLedgerEntryItem } from "@/lib/actions/customer-ledger-actions"
import { classifyMetalName } from "@/lib/business-units"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  NET_BANKING: "Net Banking",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
}

function formatAmount(value: number) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatWeight(value: number) {
  return `${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} g`
}

function formatCarat(value: number) {
  return `${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} ct`
}

/** dd-MM-yy, used consistently across every date shown in this table. */
function formatShortDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "-"
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yy = String(date.getFullYear()).slice(-2)
  return `${dd}-${mm}-${yy}`
}

function formatEntryAmount(entry: CustomerLedgerEntryItem) {
  const family = classifyMetalName(entry.metalType)

  if ((family === "GOLD" || family === "SILVER") && entry.metalWeight != null) {
    return formatWeight(entry.metalWeight)
  }

  if (family === "DIAMOND" && entry.caratWeight != null) {
    return formatCarat(entry.caratWeight)
  }

  return formatAmount(entry.amount)
}

type SortKey = "date" | "type" | "unit" | "amount"
type SortDir = "asc" | "desc"

function matchesSearch(entry: CustomerLedgerEntryItem, query: string) {
  if (!query) return true
  const haystack = `${entry.description} ${entry.sourceType} ${entry.metalType ?? "Money"} ${
    entry.invoiceNumber ?? ""
  } ${entry.creditNoteNumber ?? ""} ${entry.entryDate}`.toLowerCase()
  return haystack.includes(query)
}

function compareEntries(a: CustomerLedgerEntryItem, b: CustomerLedgerEntryItem, sortKey: SortKey) {
  switch (sortKey) {
    case "type":
      return a.type.localeCompare(b.type)
    case "unit":
      return (a.metalType ?? "Money").localeCompare(b.metalType ?? "Money")
    case "amount":
      return Math.abs(a.amount) - Math.abs(b.amount)
    case "date":
    default:
      return new Date(a.entryDateISO).getTime() - new Date(b.entryDateISO).getTime()
  }
}

function SortableHead({
  label,
  sortKey,
  activeSortKey,
  sortDir,
  onSort,
  align = "left",
  className,
}: {
  label: string
  sortKey: SortKey
  activeSortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  align?: "left" | "right"
  className?: string
}) {
  const isActive = activeSortKey === sortKey
  const Icon = isActive ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <TableHead className={cn(align === "right" ? "text-right" : undefined, className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          isActive ? "text-foreground" : "text-muted-foreground",
          align === "right" ? "flex-row-reverse" : undefined,
        )}
      >
        {label}
        <Icon className="h-3.5 w-3.5" />
      </button>
    </TableHead>
  )
}

export function CustomerLedgerHistoryTable({ entries }: { entries: CustomerLedgerEntryItem[] }) {
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [page, setPage] = useState(1)

  const filteredAndSorted = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = entries.filter((entry) => matchesSearch(entry, query))
    return [...filtered].sort((a, b) => {
      const cmp = compareEntries(a, b, sortKey)
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [entries, search, sortKey, sortDir])

  useEffect(() => {
    setPage(1)
  }, [search, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = filteredAndSorted.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )
  const rangeStart = filteredAndSorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredAndSorted.length)

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="border-b p-3">
        <div className="relative sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search ledger history..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Date" sortKey="date" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableHead label="Entry Type" sortKey="type" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableHead label="Unit" sortKey="unit" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <TableHead>Source</TableHead>
              <TableHead>Invoice</TableHead>
              <SortableHead
                label="Amount"
                sortKey="amount"
                activeSortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              />
            </TableRow>
          </TableHeader>

          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {entries.length === 0
                    ? "No ledger entries found for this party."
                    : "No entries match your search."}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-foreground">
                    {formatShortDate(entry.entryDateISO)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                        entry.type === "DEBIT"
                          ? "bg-red-50 text-red-700"
                          : "bg-green-50 text-green-700",
                      )}
                    >
                      {entry.type}
                    </span>
                  </TableCell>
                  <TableCell className="text-foreground">{entry.metalType ?? "Money"}</TableCell>
                  <TableCell className="text-foreground">
                    {entry.sourceType}
                    {entry.paymentMethod ? (
                      <span className="block text-xs text-muted-foreground">
                        {PAYMENT_METHOD_LABELS[entry.paymentMethod] ?? entry.paymentMethod}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {entry.creditNoteId && entry.creditNoteNumber ? (
                      <Link
                        href={`/billing/credit-notes/${entry.creditNoteId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                      >
                        <Receipt className="h-3.5 w-3.5" />
                        {entry.creditNoteNumber}
                      </Link>
                    ) : entry.invoiceId && entry.invoiceNumber ? (
                      <Link
                        href={`/billing/${entry.invoiceId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                      >
                        <Receipt className="h-3.5 w-3.5" />
                        {entry.invoiceNumber}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium",
                      entry.type === "DEBIT" ? "text-red-600" : "text-green-600",
                    )}
                  >
                    {formatEntryAmount(entry)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {filteredAndSorted.length > 0 && (
        <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
          <p className="text-muted-foreground">
            Showing <span className="font-medium text-foreground">{rangeStart}</span> to{" "}
            <span className="font-medium text-foreground">{rangeEnd}</span> of{" "}
            <span className="font-medium text-foreground">{filteredAndSorted.length}</span> entries
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="px-2 text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
