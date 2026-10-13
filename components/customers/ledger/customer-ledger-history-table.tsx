"use client"

import { useWeightFormat } from "@/components/providers/weight-settings-provider"
import { useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"

import type { PartyLedgerMetal, PartyLedgerRow, PartyLedgerSummary } from "@/lib/actions/customer-ledger-actions"
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
import { Button } from "@/components/ui/button"
import { formatPartyAmount } from "@/lib/party-balance"
import { PartyBalance } from "@/components/customers/party-balance"

const PAGE_SIZE = 10

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  NET_BANKING: "Net Banking",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
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

function matchesSearch(row: PartyLedgerRow, query: string) {
  if (!query) return true
  const haystack = [
    row.label,
    row.documentNumber ?? "",
    row.description,
    row.metalType ?? "",
    ...row.metals.map((metal) => metal.label),
    row.entryDate,
    formatShortDate(row.entryDateISO),
  ]
    .join(" ")
    .toLowerCase()
  return haystack.includes(query)
}

/**
 * Every entry of the party's one ledger, oldest first, with Debit / Credit
 * money columns and the running net balance after each row (starting from
 * the opening balance row). Kept chronological — re-sorting would make the
 * Balance column meaningless — and opens on the latest page. Columns wrap
 * so it fits the narrow Parties side panel.
 */
export function CustomerLedgerHistoryTable({
  rows,
  summary,
}: {
  rows: PartyLedgerRow[]
  summary: PartyLedgerSummary
}) {
  const wf = useWeightFormat()
  const [search, setSearch] = useState("")
  const query = search.trim().toLowerCase()

  const filtered = useMemo(() => rows.filter((row) => matchesSearch(row, query)), [rows, query])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // null = "the last page" (latest entries), until the user pages.
  const [page, setPage] = useState<number | null>(null)
  const currentPage = Math.min(page ?? totalPages, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const showOpening = !query && currentPage === 1

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, row) => ({ debit: acc.debit + row.debit, credit: acc.credit + row.credit }),
        { debit: 0, credit: 0 },
      ),
    [filtered],
  )

  const weightText = (metal: PartyLedgerMetal) =>
    `${metal.unit === "ct" ? wf.ct(metal.weight) : wf.g(metal.weight)} ${metal.unit}`

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="border-b p-3">
        <div className="relative sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search ledger history..."
            aria-label="Search ledger history"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(null)
            }}
            className="h-9 pl-9"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="min-w-[520px]" data-testid="party-ledger-table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[84px]">Date</TableHead>
              <TableHead>Entry</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {showOpening && (
              <TableRow className="bg-muted/30">
                <TableCell />
                <TableCell className="font-medium">Opening balance</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right">
                  <PartyBalance net={summary.openingBalance} className="justify-end" />
                </TableCell>
              </TableRow>
            )}
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No entries match your search.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => {
                const metalOnly = row.debit === 0 && row.credit === 0
                return (
                  <TableRow key={row.id} className="align-top" data-testid="party-ledger-row">
                    <TableCell className="whitespace-nowrap text-foreground">
                      {formatShortDate(row.entryDateISO)}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium text-foreground">
                        {row.label}
                        {row.documentNumber ? (
                          row.href ? (
                            <>
                              {" "}
                              <Link href={row.href} className="text-primary underline-offset-4 hover:underline">
                                #{row.documentNumber}
                              </Link>
                            </>
                          ) : (
                            ` #${row.documentNumber}`
                          )
                        ) : null}
                      </div>
                      {row.description ? (
                        <div className="text-xs text-muted-foreground">{row.description}</div>
                      ) : null}
                      {row.paymentMethod ? (
                        <div className="text-xs text-muted-foreground">
                          {PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod}
                        </div>
                      ) : null}
                      {row.metals.length > 0 ? (
                        <div className="mt-0.5 text-xs text-foreground">
                          {row.metals.map((metal) => (
                            <span key={`${metal.label}|${metal.unit}`} className="mr-2 inline-block whitespace-nowrap">
                              {metal.label}: <span className="tabular-nums">{weightText(metal)}</span>
                            </span>
                          ))}
                        </div>
                      ) : metalOnly && (row.metalWeight != null || row.caratWeight != null) ? (
                        <div className="mt-0.5 text-xs text-foreground">
                          {row.metalType ?? "Metal"}:{" "}
                          {row.caratWeight != null ? `${wf.ct(row.caratWeight)} ct` : `${wf.g(row.metalWeight)} g`}
                        </div>
                      ) : null}
                      {row.stockValue ? (
                        <div className="text-[11px] text-muted-foreground">
                          Stock value {formatPartyAmount(row.stockValue)} · not owed
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium text-red-600">
                      {row.debit ? formatPartyAmount(row.debit) : ""}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium text-green-600">
                      {row.credit ? formatPartyAmount(row.credit) : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <PartyBalance net={row.balance} className="justify-end" />
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
          {/* Totals over every row matching the search (all pages); the
              closing balance is the party's net balance. */}
          <TableFooter>
            <TableRow className="font-semibold">
              <TableCell />
              <TableCell>{query ? "Total (matching)" : "Total"}</TableCell>
              <TableCell className="whitespace-nowrap text-right text-red-600">{formatPartyAmount(totals.debit)}</TableCell>
              <TableCell className="whitespace-nowrap text-right text-green-600">{formatPartyAmount(totals.credit)}</TableCell>
              <TableCell className="text-right">
                <PartyBalance net={summary.netBalance} className="justify-end" />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
          <p className="text-muted-foreground">
            Page {currentPage} of {totalPages} · {filtered.length} entries
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Older
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              Newer
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
