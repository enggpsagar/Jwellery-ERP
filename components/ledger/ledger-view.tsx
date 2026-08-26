"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  CalendarDays,
  ArrowRightLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  Search,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
} from "lucide-react"

import type { LedgerEntryRow, LedgerTotals } from "@/lib/actions/ledger-actions"
import { classifyMetalName } from "@/lib/business-units"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LedgerDetailDrawer } from "@/components/ledger/ledger-detail-drawer"
import { ExportMenu } from "@/components/shared/export-menu"

function formatCurrency(value: number, withSign = false) {
  const abs = Math.abs(value)
  const formatted = `₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
  if (withSign) return `${value >= 0 ? "+" : "-"}${formatted}`
  return formatted
}

/** Gold/silver entries are settled by weight, not rupees — show the weight instead of ₹ for those rows. */
function formatEntryValue(entry: LedgerEntryRow) {
  const family = classifyMetalName(entry.metalType)

  if ((family === "GOLD" || family === "SILVER") && entry.metalWeight != null) {
    return `${Math.abs(entry.metalWeight).toLocaleString("en-IN", { maximumFractionDigits: 3 })} g`
  }

  return formatCurrency(entry.amount)
}

function daysAgo(dateISO: string) {
  const then = new Date(dateISO).getTime()
  const now = Date.now()
  return Math.floor((now - then) / (1000 * 60 * 60 * 24))
}

const PAGE_SIZE = 20

const dateRanges = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
]

type LedgerViewProps = {
  entries: LedgerEntryRow[]
  totals: LedgerTotals
}

export function LedgerView({ entries, totals }: LedgerViewProps) {
  const [search, setSearch] = useState("")
  const [dateRange, setDateRange] = useState("30d")
  const [account, setAccount] = useState("all")
  const [txnType, setTxnType] = useState("all")
  const [selected, setSelected] = useState<LedgerEntryRow | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [page, setPage] = useState(1)

  const accounts = useMemo(
    () => Array.from(new Set(entries.map((e) => e.account).filter((a) => a !== "—"))).sort(),
    [entries],
  )

  const types = useMemo(
    () => Array.from(new Set(entries.map((e) => e.sourceLabel))).sort(),
    [entries],
  )

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (account !== "all" && entry.account !== account) return false
      if (txnType !== "all" && entry.sourceLabel !== txnType) return false
      if (dateRange !== "all") {
        const maxDays = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90
        if (daysAgo(entry.dateISO) > maxDays) return false
      }
      if (search) {
        const q = search.toLowerCase()
        const haystack = `${entry.account} ${entry.id} ${entry.invoiceNumber ?? ""} ${entry.description}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [entries, account, txnType, dateRange, search])

  const hasFilters = account !== "all" || txnType !== "all" || search.length > 0

  useEffect(() => {
    setPage(1)
  }, [account, txnType, dateRange, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length)

  function clearFilters() {
    setAccount("all")
    setTxnType("all")
    setSearch("")
  }

  function openEntry(entry: LedgerEntryRow) {
    setSelected(entry)
    setDrawerOpen(true)
  }

  const formatUnitTotal = (unit: LedgerTotals["unitTotals"][number], value: number) =>
    unit.unit === "DIAMOND"
      ? formatCurrency(value)
      : `${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 3 })} g`

  const summaryCards = [
    ...(totals.moneyActive
      ? [
          {
            label: "Total Debit",
            value: formatCurrency(totals.totalDebit),
            sub: "Amount owed by customers",
            icon: ArrowUpCircle,
            accent: "text-destructive bg-destructive/10",
          },
          {
            label: "Total Credit",
            value: formatCurrency(totals.totalCredit),
            sub: "Payments received",
            icon: ArrowDownCircle,
            accent: "text-emerald-600 bg-emerald-50",
          },
        ]
      : []),
    ...totals.unitTotals.flatMap((unit) => [
      {
        label: `${unit.label} Debit`,
        value: formatUnitTotal(unit, unit.debit),
        sub: `Owed in ${unit.label.toLowerCase()}`,
        icon: ArrowUpCircle,
        accent: "text-destructive bg-destructive/10",
      },
      {
        label: `${unit.label} Credit`,
        value: formatUnitTotal(unit, unit.credit),
        sub: `Received in ${unit.label.toLowerCase()}`,
        icon: ArrowDownCircle,
        accent: "text-emerald-600 bg-emerald-50",
      },
    ]),
    {
      label: "Today's Transactions",
      value: String(totals.todayCount),
      sub: "Recorded today",
      icon: ArrowRightLeft,
      accent: "text-primary bg-primary/10",
    },
  ]

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summaryCards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <CardDescription>{card.label}</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {card.value}
                </CardTitle>
              </div>
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-lg",
                  card.accent,
                )}
              >
                <card.icon className="size-5" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-4 border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle>Ledger Entries</CardTitle>
              <CardDescription>
                Money movement across all customer and karigar accounts.
              </CardDescription>
            </div>
            <ExportMenu href="/ledger/export?scope=entries" label="Export" />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1 lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search accounts, invoices, notes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="h-9 w-[160px]">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  <SelectValue placeholder="Date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {dateRanges.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <Select value={account} onValueChange={setAccount}>
                <SelectTrigger className="h-9 w-[170px]">
                  <SelectValue placeholder="Account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All accounts</SelectItem>
                    {accounts.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <Select value={txnType} onValueChange={setTxnType}>
                <SelectTrigger className="h-9 w-[150px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All types</SelectItem>
                    {types.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              {hasFilters ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-muted-foreground"
                >
                  <X data-icon="inline-start" />
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Date</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead className="hidden md:table-cell">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-32 text-center text-muted-foreground"
                  >
                    No ledger entries match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((entry) => (
                  <TableRow
                    key={entry.id}
                    onClick={() => openEntry(entry)}
                    className="cursor-pointer"
                  >
                    <TableCell className="pl-6 whitespace-nowrap text-sm text-muted-foreground">
                      {entry.date}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-7">
                          <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                            {entry.accountInitials || "—"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium leading-tight">
                            {entry.account}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {entry.sourceLabel}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-normal",
                          entry.type === "CREDIT"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-destructive/30 bg-destructive/10 text-destructive",
                        )}
                      >
                        {entry.type === "CREDIT" ? "Credit" : "Debit"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.type === "DEBIT" ? (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <ArrowUpRight className="size-3.5" />
                          {formatEntryValue(entry)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.type === "CREDIT" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <ArrowDownLeft className="size-3.5" />
                          {formatEntryValue(entry)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {entry.invoiceId && entry.invoiceNumber ? (
                        <Link
                          href={`/billing/${entry.invoiceId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                        >
                          <Receipt className="size-3.5" />
                          {entry.invoiceNumber}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden max-w-[260px] md:table-cell">
                      <span className="block truncate text-sm text-muted-foreground">
                        {entry.description}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>

        {filtered.length > 0 && (
          <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
            <p className="text-muted-foreground">
              Showing <span className="font-medium text-foreground">{rangeStart}</span> to{" "}
              <span className="font-medium text-foreground">{rangeEnd}</span> of{" "}
              <span className="font-medium text-foreground">{filtered.length}</span> entries
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
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
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <LedgerDetailDrawer
        entry={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </>
  )
}
