// FILE PATH: components/karigars/karigar-ledger-summary-table.tsx
import Link from "next/link"

import { WeightText } from "@/components/shared/weight-text"

import type { KarigarLedgerSummaryRow } from "@/lib/actions/ledger-actions"
import { toTitleCase } from "@/lib/utils"
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
            <div className="text-xl font-semibold"><WeightText value={totals.outstandingGold} /></div>
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
            <div className="text-xl font-semibold text-blue-600">₹ {totals.totalPaid.toLocaleString("en-IN")}</div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total Cash Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold text-red-600">
              ₹ {totals.outstandingCash.toLocaleString("en-IN")}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Artisan</TableHead>
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
                  No artisans yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <RecordHoverCard
                      label={toTitleCase(row.name)}
                      href={`/karigars/${row.id}`}
                      title={toTitleCase(row.name)}
                      subtitle={row.code ?? undefined}
                      footerLabel="View artisan"
                      sections={[
                        {
                          fields: [
                            { label: "Opening gold", value: <WeightText value={row.openingGold} /> },
                            { label: "Gold issued", value: <WeightText value={row.goldIssued} /> },
                            { label: "Gold used", value: <WeightText value={row.goldUsed} /> },
                            {
                              label: "Gold outstanding",
                              value: <WeightText value={row.outstandingGold} />,
                            },
                          ],
                        },
                        {
                          fields: [
                            { label: "Items delivered", value: row.itemsDelivered },
                            { label: "Earned", value: inr(row.totalEarned) },
                            { label: "Paid", value: <span className="text-blue-600">{inr(row.totalPaid)}</span> },
                            {
                              label: "Cash outstanding",
                              value: <span className="text-red-600">{inr(row.outstandingCash)}</span>,
                            },
                          ],
                        },
                      ]}
                    />
                    {row.code ? (
                      <span className="ml-1 text-xs text-muted-foreground">({row.code})</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right"><WeightText value={row.goldIssued} /></TableCell>
                  <TableCell className="text-right"><WeightText value={row.goldUsed} /></TableCell>
                  <TableCell className="text-right font-medium">
                    <WeightText value={row.outstandingGold} />
                  </TableCell>
                  <TableCell className="text-right">{row.itemsDelivered}</TableCell>
                  <TableCell className="text-right">
                    ₹ {row.totalEarned.toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="text-right text-blue-600">
                    ₹ {row.totalPaid.toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="text-right font-medium text-red-600">
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
