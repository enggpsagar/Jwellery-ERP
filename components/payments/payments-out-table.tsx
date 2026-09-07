"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Search, FileText } from "lucide-react"

import type { PaymentOutRow } from "@/lib/actions/payments-actions"
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
import { PaymentOutDetailPanel } from "@/components/payments/payment-out-detail-panel"
import { cn } from "@/lib/utils"

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  NET_BANKING: "Net Banking",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
}

const PAGE_SIZE = 15

function inr(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

export function PaymentsOutTable({ rows }: { rows: PaymentOutRow[] }) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  // Defaults to the first row on load so the panel is never empty —
  // matching CustomersClient/PurchasesClient/InvoicesClient.
  const [activeId, setActiveId] = useState<string | null>(rows[0]?.id ?? null)

  useEffect(() => {
    setActiveId((current) => {
      if (current && rows.some((row) => row.id === current)) return current
      return rows[0]?.id ?? null
    })
  }, [rows])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) =>
      `${row.partyName} ${row.purchaseNumber ?? ""} ${row.description}`
        .toLowerCase()
        .includes(query),
    )
  }, [rows, search])

  const total = filtered.reduce((sum, row) => sum + row.amount, 0)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length)
  const activeRow = rows.find((row) => row.id === activeId) ?? null

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total Payment Out</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-red-600">{inr(total)}</div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{filtered.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="relative sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search vendor, artisan, notes..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="h-9 pl-9"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Paid To</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Purchase</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {rows.length === 0 ? "No payments made yet." : "No entries match your search."}
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() => setActiveId(row.id)}
                    className={cn("cursor-pointer hover:bg-accent/50", activeId === row.id && "bg-accent")}
                  >
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {row.date}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Link
                          href={row.partyType === "VENDOR" ? `/vendors/${row.partyId}` : `/karigars/${row.partyId}`}
                          className="hover:underline"
                        >
                          {row.partyName}
                        </Link>
                        <Badge variant="outline" className="font-normal">
                          {row.partyType === "VENDOR" ? "Vendor" : "Artisan"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.paymentMethod ? PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod : "-"}
                    </TableCell>
                    <TableCell>
                      {row.purchaseId && row.purchaseNumber ? (
                        <Link
                          href={`/purchases/${row.purchaseId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                        >
                          <FileText className="size-3.5" />
                          {row.purchaseNumber}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">On account</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium text-red-600">
                      {inr(row.amount)}
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
              <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
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
    </div>

      <PaymentOutDetailPanel row={activeRow} />
    </div>
  )
}
