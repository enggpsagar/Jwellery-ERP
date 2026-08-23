import type { KarigarLedgerRow } from "@/lib/actions/ledger-actions"

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

type KarigarLedgerTableProps = {
  rows: KarigarLedgerRow[]
  finalFineGoldBalance: number
  finalCashBalance: number
}

export function KarigarLedgerTable({
  rows,
  finalFineGoldBalance,
  finalCashBalance,
}: KarigarLedgerTableProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Fine Gold Balance (with karigar)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {finalFineGoldBalance.toFixed(3)}g
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Cash Balance (owed to karigar)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              ₹ {finalCashBalance.toLocaleString("en-IN")}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Fine Weight</TableHead>
              <TableHead className="text-right">Running Gold Balance</TableHead>
              <TableHead className="text-right">Cash Amount</TableHead>
              <TableHead className="text-right">Running Cash Balance</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No ledger entries yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const isDebit = row.type === "DEBIT"
                return (
                  <TableRow key={row.id}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>
                      <Badge variant={isDebit ? "destructive" : "secondary"}>
                        {row.type}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.sourceLabel}</TableCell>
                    <TableCell className="max-w-xs truncate" title={row.description}>
                      {row.description}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.metalWeightFine
                        ? `${isDebit ? "+" : "-"}${row.metalWeightFine.toFixed(3)}g`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {row.runningFineGoldBalance.toFixed(3)}g
                    </TableCell>
                    <TableCell className="text-right">
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
      </div>
    </div>
  )
}
