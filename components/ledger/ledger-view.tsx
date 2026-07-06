"use client"

import { useMemo, useState } from "react"
import {
  CalendarDays,
  Coins,
  CircleDollarSign,
  ArrowRightLeft,
  Search,
  X,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react"

import { ledgerEntries, ledgerCustomers, type LedgerEntry } from "@/lib/data"
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

function formatGrams(value: number, withSign = false) {
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString("en-IN", {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 3,
  })
  if (withSign) return `${value >= 0 ? "+" : "-"}${formatted} g`
  return `${formatted} g`
}

const metalStyles: Record<LedgerEntry["metal"], string> = {
  Gold: "border-primary/40 bg-primary/10 text-primary",
  Silver: "border-border bg-muted text-muted-foreground",
}

const dateRanges = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "quarter", label: "This quarter" },
  { value: "year", label: "This financial year" },
  { value: "all", label: "All time" },
]

const txnTypes = ["Receipt", "Issue", "Sale", "Purchase", "Adjustment"]

export function LedgerView() {
  const [search, setSearch] = useState("")
  const [dateRange, setDateRange] = useState("30d")
  const [customer, setCustomer] = useState("all")
  const [txnType, setTxnType] = useState("all")
  const [selected, setSelected] = useState<LedgerEntry | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const filtered = useMemo(() => {
    return ledgerEntries.filter((entry) => {
      if (customer !== "all" && entry.customer !== customer) return false
      if (txnType !== "all" && entry.type !== txnType) return false
      if (search) {
        const q = search.toLowerCase()
        const haystack =
          `${entry.customer} ${entry.id} ${entry.reference} ${entry.notes}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [customer, txnType, search])

  const totals = useMemo(() => {
    const gold = ledgerEntries
      .filter((e) => e.metal === "Gold")
      .reduce((sum, e) => sum + e.weightIn - e.weightOut, 0)
    const silver = ledgerEntries
      .filter((e) => e.metal === "Silver")
      .reduce((sum, e) => sum + e.weightIn - e.weightOut, 0)
    const today = ledgerEntries.filter(
      (e) => e.dateISO === "2026-06-19",
    ).length
    return { gold, silver, today }
  }, [])

  const hasFilters =
    customer !== "all" || txnType !== "all" || search.length > 0

  function clearFilters() {
    setCustomer("all")
    setTxnType("all")
    setSearch("")
  }

  function openEntry(entry: LedgerEntry) {
    setSelected(entry)
    setDrawerOpen(true)
  }

  const summaryCards = [
    {
      label: "Total Gold Balance",
      value: formatGrams(totals.gold),
      sub: "22K, 24K & 18K combined",
      icon: CircleDollarSign,
      accent: "text-primary bg-primary/10",
    },
    {
      label: "Total Silver Balance",
      value: formatGrams(totals.silver),
      sub: "Fine & sterling combined",
      icon: Coins,
      accent: "text-foreground bg-muted",
    },
    {
      label: "Today's Transactions",
      value: String(totals.today),
      sub: "Recorded on 19 Jun 2026",
      icon: ArrowRightLeft,
      accent: "text-emerald-600 bg-emerald-50",
    },
  ]

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          <div className="flex flex-col gap-1">
            <CardTitle>Ledger Entries</CardTitle>
            <CardDescription>
              Metal movement across all customer and karigar accounts.
            </CardDescription>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1 lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search entries, refs, notes..."
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

              <Select value={customer} onValueChange={setCustomer}>
                <SelectTrigger className="h-9 w-[170px]">
                  <SelectValue placeholder="Customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All customers</SelectItem>
                    {ledgerCustomers.map((c) => (
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
                    {txnTypes.map((t) => (
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
                <TableHead>Customer</TableHead>
                <TableHead>Metal Type</TableHead>
                <TableHead className="text-right">Weight In</TableHead>
                <TableHead className="text-right">Weight Out</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="hidden md:table-cell">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-32 text-center text-muted-foreground"
                  >
                    No ledger entries match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((entry) => (
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
                            {entry.customerInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium leading-tight">
                            {entry.customer}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {entry.type} · {entry.reference}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("font-normal", metalStyles[entry.metal])}
                      >
                        {entry.metal} · {entry.purity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.weightIn > 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <ArrowDownLeft className="size-3.5" />
                          {formatGrams(entry.weightIn)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.weightOut > 0 ? (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <ArrowUpRight className="size-3.5" />
                          {formatGrams(entry.weightOut)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        entry.balance >= 0
                          ? "text-emerald-600"
                          : "text-destructive",
                      )}
                    >
                      {formatGrams(entry.balance, true)}
                    </TableCell>
                    <TableCell className="hidden max-w-[260px] md:table-cell">
                      <span className="block truncate text-sm text-muted-foreground">
                        {entry.notes}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LedgerDetailDrawer
        entry={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </>
  )
}
