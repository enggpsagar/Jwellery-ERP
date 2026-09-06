"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Search } from "lucide-react"

import type { KarigarLedgerRow, KarigarLedgerMetalGroup } from "@/lib/actions/ledger-actions"
import { cn } from "@/lib/utils"
import { RecordHoverCard } from "@/components/shared/record-hover-card"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  NET_BANKING: "Net Banking",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
}

const PAGE_SIZE = 10

type SortKey = "date" | "metal" | "weight" | "amount" | "type"

const FINANCIAL_SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "type", label: "Type" },
  { value: "amount", label: "Amount" },
]

const MATERIAL_SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "metal", label: "Metal" },
  { value: "weight", label: "Fine Weight" },
]

/** Money as it reads on a jewellery ledger. */
function inr(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null
  const amount = Number(value)
  if (!Number.isFinite(amount)) return null
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount)
}

function matchesSearch(row: KarigarLedgerRow, query: string) {
  if (!query) return true
  const haystack = `${row.description} ${row.sourceLabel} ${row.date} ${row.metalType ?? ""} ${
    row.paymentMethod ?? ""
  }`.toLowerCase()
  return haystack.includes(query)
}

function compareRows(a: KarigarLedgerRow, b: KarigarLedgerRow, sortKey: SortKey) {
  switch (sortKey) {
    case "metal":
      return (a.metalType ?? "").localeCompare(b.metalType ?? "")
    case "weight":
      return Math.abs(a.metalWeightFine ?? 0) - Math.abs(b.metalWeightFine ?? 0)
    case "amount":
      return Math.abs(a.amount) - Math.abs(b.amount)
    case "type":
      return a.type.localeCompare(b.type)
    case "date":
    default:
      return new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime()
  }
}

function filterAndSortRows(
  rows: KarigarLedgerRow[],
  search: string,
  sortKey: SortKey,
  sortDir: "asc" | "desc",
) {
  const query = search.trim().toLowerCase()
  const filtered = rows.filter((row) => matchesSearch(row, query))
  return [...filtered].sort((a, b) => {
    const cmp = compareRows(a, b, sortKey)
    return sortDir === "asc" ? cmp : -cmp
  })
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="relative flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 pl-9"
      />
    </div>
  )
}

function SortControl({
  sortKey,
  sortDir,
  onSortKeyChange,
  onToggleDir,
  options,
}: {
  sortKey: SortKey
  sortDir: "asc" | "desc"
  onSortKeyChange: (value: SortKey) => void
  onToggleDir: () => void
  options: { value: SortKey; label: string }[]
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Select value={sortKey} onValueChange={(value) => onSortKeyChange(value as SortKey)}>
        <SelectTrigger className="h-9 w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              Sort: {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={onToggleDir}
        title={sortDir === "asc" ? "Ascending — click for descending" : "Descending — click for ascending"}
      >
        {sortDir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </Button>
    </div>
  )
}

function PaginationFooter({
  currentPage,
  totalPages,
  rangeStart,
  rangeEnd,
  total,
  onPrev,
  onNext,
}: {
  currentPage: number
  totalPages: number
  rangeStart: number
  rangeEnd: number
  total: number
  onPrev: () => void
  onNext: () => void
}) {
  if (total === 0) return null

  return (
    <div className="flex flex-col gap-2 border-t px-3 py-2 text-xs md:flex-row md:items-center md:justify-between">
      <p className="text-muted-foreground">
        Showing <span className="font-medium text-foreground">{rangeStart}</span>–
        <span className="font-medium text-foreground">{rangeEnd}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span> entries
      </p>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={onPrev}>
          Previous
        </Button>
        <span className="px-1 text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  )
}

type KarigarLedgerTableProps = {
  rows: KarigarLedgerRow[]
  finalCashBalance: number
  /** Lifetime totals — always over every entry, never the currently
   *  searched/paginated subset, so the summary cards stay a stable
   *  "overall" figure no matter what the table above is filtered to. */
  totalDebit: number
  totalCredit: number
  /** One entry per metal actually used in this karigar's material ledger —
   *  see getKarigarLedger's own doc comment for why grams of Gold and grams
   *  of Silver are never summed into one balance. Ignored for the
   *  "financial" variant. */
  materialGroups: KarigarLedgerMetalGroup[]
  /** "financial" shows only cash movements (wages, advances, payments) in
   *  one running-balance table; "material" renders one side-by-side pair
   *  of tables — issued (DEBIT, metal balance increases: it's now with the
   *  karigar) vs received back (CREDIT, balance decreases) — per metal
   *  group, each with its own "who owes whom" figure. */
  variant: "financial" | "material"
}

function DateCell({ row, metalLabel }: { row: KarigarLedgerRow; metalLabel: string }) {
  return (
    <RecordHoverCard
      label={row.date}
      title={row.sourceLabel}
      subtitle={row.date}
      sections={[
        {
          fields: [
            { label: "Type", value: row.type },
            { label: "Payment Method", value: PAYMENT_METHOD_LABELS[row.paymentMethod ?? ""] ?? row.paymentMethod },
            { label: "Description", value: row.description },
          ],
        },
        {
          fields: [
            {
              label: `Fine ${row.metalType ?? metalLabel}`,
              value: row.metalWeightFine !== null ? `${row.metalWeightFine.toFixed(3)} g` : null,
            },
            { label: "Amount", value: inr(row.amount) },
          ],
        },
        {
          fields: [
            { label: `${metalLabel} balance`, value: `${row.runningFineGoldBalance.toFixed(3)} g` },
            { label: "Cash balance", value: inr(row.runningCashBalance) },
          ],
        },
      ]}
    />
  )
}

function MaterialSideTable({
  title,
  rows,
  metalLabel,
  search,
  sortKey,
  sortDir,
}: {
  title: string
  rows: KarigarLedgerRow[]
  metalLabel: string
  search: string
  sortKey: SortKey
  sortDir: "asc" | "desc"
}) {
  const [page, setPage] = useState(1)

  const filteredSorted = useMemo(
    () => filterAndSortRows(rows, search, sortKey, sortDir),
    [rows, search, sortKey, sortDir],
  )

  useEffect(() => {
    setPage(1)
  }, [search, sortKey, sortDir, rows])

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = filteredSorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const rangeStart = filteredSorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredSorted.length)

  // This table's own header total tracks whatever's currently filtered —
  // the stable, always-over-everything total lives in the summary section
  // below both tables instead (see MetalGroupSection).
  const filteredTotal = filteredSorted.reduce((sum, row) => sum + (row.metalWeightFine ?? 0), 0)

  return (
    <div className="flex-1 space-y-2">
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-sm font-medium tabular-nums">{filteredTotal.toFixed(3)}g</span>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Fine Weight</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  {rows.length === 0 ? "No entries yet." : "No entries match your search."}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <DateCell row={row} metalLabel={metalLabel} />
                  </TableCell>
                  <TableCell>
                    {row.sourceLabel}
                    {row.paymentMethod ? (
                      <span className="block text-xs text-muted-foreground">
                        {PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-xs truncate" title={row.description}>
                    {row.description}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.metalWeightFine ? `${row.metalWeightFine.toFixed(3)}g` : "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <PaginationFooter
          currentPage={currentPage}
          totalPages={totalPages}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          total={filteredSorted.length}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      </div>
    </div>
  )
}

function MetalGroupSection({
  group,
  search,
  sortKey,
  sortDir,
}: {
  group: KarigarLedgerMetalGroup
  search: string
  sortKey: SortKey
  sortDir: "asc" | "desc"
}) {
  const issuedRows = group.rows.filter((row) => row.type === "DEBIT")
  const receivedRows = group.rows.filter((row) => row.type === "CREDIT")

  // Positive balance = more issued than received back — the metal is still
  // with the karigar, i.e. the karigar owes it to the store. A negative
  // balance (more received than ever issued — an adjustment/correction
  // case) means the reverse.
  const owesLabel =
    group.finalFineBalance > 0
      ? `Karigar owes you ${group.finalFineBalance.toFixed(3)}g`
      : group.finalFineBalance < 0
        ? `You owe the karigar ${Math.abs(group.finalFineBalance).toFixed(3)}g`
        : "Settled"

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-4 lg:flex-row">
        <MaterialSideTable
          title="Gold Given to Karigar"
          rows={issuedRows}
          metalLabel={group.metalLabel}
          search={search}
          sortKey={sortKey}
          sortDir={sortDir}
        />
        <MaterialSideTable
          title="Material Received from Karigar"
          rows={receivedRows}
          metalLabel={group.metalLabel}
          search={search}
          sortKey={sortKey}
          sortDir={sortDir}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Total {group.metalLabel} Issued
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{group.totalIssuedFine.toFixed(3)}g</div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Total {group.metalLabel} Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{group.totalReceivedFine.toFixed(3)}g</div>
          </CardContent>
        </Card>

        <Card
          size="sm"
          className={
            group.finalFineBalance > 0
              ? "border-red-200 bg-red-50"
              : group.finalFineBalance < 0
                ? "border-emerald-200 bg-emerald-50"
                : undefined
          }
        >
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Outstanding Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-lg font-semibold",
                group.finalFineBalance > 0
                  ? "text-red-700"
                  : group.finalFineBalance < 0
                    ? "text-emerald-700"
                    : undefined,
              )}
            >
              {owesLabel}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function KarigarLedgerTable({
  rows,
  finalCashBalance,
  totalDebit,
  totalCredit,
  materialGroups,
  variant,
}: KarigarLedgerTableProps) {
  // One tab per metal actually used, so a karigar working several metals
  // doesn't turn this page into one long vertical scroll — the first
  // (most-active, see getKarigarLedger's own sort) metal is shown by
  // default. Falls back to the first group if the previously-active one
  // ever disappears from a refreshed list, rather than showing nothing.
  const [activeMetalId, setActiveMetalId] = useState<string | null>(
    () => materialGroups[0]?.metalTypeId ?? null,
  )

  const [materialSearch, setMaterialSearch] = useState("")
  const [materialSortKey, setMaterialSortKey] = useState<SortKey>("date")
  const [materialSortDir, setMaterialSortDir] = useState<"asc" | "desc">("asc")

  const [financialSearch, setFinancialSearch] = useState("")
  const [financialSortKey, setFinancialSortKey] = useState<SortKey>("date")
  const [financialSortDir, setFinancialSortDir] = useState<"asc" | "desc">("asc")
  const [financialPage, setFinancialPage] = useState(1)

  const visibleRows = useMemo(() => rows.filter((row) => row.amount !== null), [rows])

  const financialFilteredSorted = useMemo(
    () => filterAndSortRows(visibleRows, financialSearch, financialSortKey, financialSortDir),
    [visibleRows, financialSearch, financialSortKey, financialSortDir],
  )

  useEffect(() => {
    setFinancialPage(1)
  }, [financialSearch, financialSortKey, financialSortDir])

  const financialTotalPages = Math.max(1, Math.ceil(financialFilteredSorted.length / PAGE_SIZE))
  const financialCurrentPage = Math.min(financialPage, financialTotalPages)
  const financialPaginated = financialFilteredSorted.slice(
    (financialCurrentPage - 1) * PAGE_SIZE,
    financialCurrentPage * PAGE_SIZE,
  )
  const financialRangeStart =
    financialFilteredSorted.length === 0 ? 0 : (financialCurrentPage - 1) * PAGE_SIZE + 1
  const financialRangeEnd = Math.min(financialCurrentPage * PAGE_SIZE, financialFilteredSorted.length)

  if (variant === "material") {
    if (materialGroups.length === 0) {
      return (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          No material ledger entries yet.
        </div>
      )
    }

    const activeGroup =
      materialGroups.find((group) => group.metalTypeId === activeMetalId) ?? materialGroups[0]

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2 border-b">
          {materialGroups.map((group) => {
            const key = group.metalTypeId ?? "unassigned"
            const isActive = activeGroup.metalTypeId === group.metalTypeId
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveMetalId(group.metalTypeId)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {group.metalLabel}
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={materialSearch}
            onChange={setMaterialSearch}
            placeholder="Search description, source..."
          />
          <SortControl
            sortKey={materialSortKey}
            sortDir={materialSortDir}
            onSortKeyChange={setMaterialSortKey}
            onToggleDir={() => setMaterialSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            options={MATERIAL_SORT_OPTIONS}
          />
        </div>

        <MetalGroupSection
          group={activeGroup}
          search={materialSearch}
          sortKey={materialSortKey}
          sortDir={materialSortDir}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card size="sm" className="md:max-w-sm">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Cash Balance (owed to karigar)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold text-red-600">
            ₹ {finalCashBalance.toLocaleString("en-IN")}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={financialSearch}
          onChange={setFinancialSearch}
          placeholder="Search description, source..."
        />
        <SortControl
          sortKey={financialSortKey}
          sortDir={financialSortDir}
          onSortKeyChange={setFinancialSortKey}
          onToggleDir={() => setFinancialSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          options={FINANCIAL_SORT_OPTIONS}
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Cash Amount</TableHead>
              <TableHead className="text-right">Running Cash Balance</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {financialPaginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {visibleRows.length === 0
                    ? "No financial ledger entries yet."
                    : "No entries match your search."}
                </TableCell>
              </TableRow>
            ) : (
              financialPaginated.map((row) => {
                const isDebit = row.type === "DEBIT"
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <DateCell row={row} metalLabel={row.metalType ?? "Metal"} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={isDebit ? "destructive" : "secondary"}>{row.type}</Badge>
                    </TableCell>
                    <TableCell>
                      {row.sourceLabel}
                      {row.paymentMethod ? (
                        <span className="block text-xs text-muted-foreground">
                          {PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={row.description}>
                      {row.description}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.amount
                        ? `${isDebit ? "+" : "-"}₹${row.amount.toLocaleString("en-IN")}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ₹ {row.runningCashBalance.toLocaleString("en-IN")}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        <PaginationFooter
          currentPage={financialCurrentPage}
          totalPages={financialTotalPages}
          rangeStart={financialRangeStart}
          rangeEnd={financialRangeEnd}
          total={financialFilteredSorted.length}
          onPrev={() => setFinancialPage((p) => Math.max(1, p - 1))}
          onNext={() => setFinancialPage((p) => Math.min(financialTotalPages, p + 1))}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total Debit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-destructive">
              ₹ {totalDebit.toLocaleString("en-IN")}
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total Credit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-emerald-600">
              ₹ {totalCredit.toLocaleString("en-IN")}
            </div>
          </CardContent>
        </Card>

        <Card size="sm" className={finalCashBalance > 0 ? "border-red-200 bg-red-50" : undefined}>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Net Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-lg font-semibold",
                finalCashBalance > 0 ? "text-red-700" : undefined,
              )}
            >
              ₹ {finalCashBalance.toLocaleString("en-IN")}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
