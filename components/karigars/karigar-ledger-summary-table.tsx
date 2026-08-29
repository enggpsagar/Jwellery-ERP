// FILE PATH: components/karigars/karigar-ledger-summary-table.tsx
import Link from "next/link"

import type { KarigarLedgerSummaryRow } from "@/lib/actions/ledger-actions"
import { RecordHoverCard } from "@/components/shared/record-hover-card"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

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

type KarigarLedgerSummaryTableProps = {
  rows: KarigarLedgerSummaryRow[]
  totals: {
    outstandingGold: number
    totalEarned: number
    totalPaid: number
    outstandingCash: number
  }
}

export function KarigarLedgerSummaryTable({ rows, totals }: KarigarLedgerSummaryTableProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Total Gold Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">{totals.outstandingGold.toFixed(3)}g</div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total Earned (Labour)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">₹ {totals.totalEarned.toLocaleString("en-IN")}</div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">₹ {totals.totalPaid.toLocaleString("en-IN")}</div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total Cash Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">
              ₹ {totals.outstandingCash.toLocaleString("en-IN")}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Karigar</TableHead>
              <TableHead className="text-right">Gold Issued</TableHead>
              <TableHead className="text-right">Gold Used (Delivered Items)</TableHead>
              <TableHead className="text-right">Outstanding Gold</TableHead>
              <TableHead className="text-right">Items Delivered</TableHead>
              <TableHead className="text-right">Total Earned</TableHead>
              <TableHead className="text-right">Total Paid</TableHead>
              <TableHead className="text-right">Outstanding Cash</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No karigars yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <RecordHoverCard
                      label={row.name}
                      href={`/karigars/${row.id}`}
                      title={row.name}
                      subtitle={row.code ?? undefined}
                      footerLabel="View karigar"
                      sections={[
                        {
                          fields: [
                            { label: "Opening gold", value: `${row.openingGold.toFixed(3)} g` },
                            { label: "Gold issued", value: `${row.goldIssued.toFixed(3)} g` },
                            { label: "Gold used", value: `${row.goldUsed.toFixed(3)} g` },
                            {
                              label: "Gold outstanding",
                              value: `${row.outstandingGold.toFixed(3)} g`,
                            },
                          ],
                        },
                        {
                          fields: [
                            { label: "Items delivered", value: row.itemsDelivered },
                            { label: "Earned", value: inr(row.totalEarned) },
                            { label: "Paid", value: inr(row.totalPaid) },
                            { label: "Cash outstanding", value: inr(row.outstandingCash) },
                          ],
                        },
                      ]}
                    />
                    {row.code ? (
                      <span className="ml-1 text-xs text-muted-foreground">({row.code})</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">{row.goldIssued.toFixed(3)}g</TableCell>
                  <TableCell className="text-right">{row.goldUsed.toFixed(3)}g</TableCell>
                  <TableCell className="text-right font-medium">
                    {row.outstandingGold.toFixed(3)}g
                  </TableCell>
                  <TableCell className="text-right">{row.itemsDelivered}</TableCell>
                  <TableCell className="text-right">
                    ₹ {row.totalEarned.toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="text-right">
                    ₹ {row.totalPaid.toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ₹ {row.outstandingCash.toLocaleString("en-IN")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
