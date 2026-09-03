import type { KarigarLedgerRow } from "@/lib/actions/ledger-actions"
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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  NET_BANKING: "Net Banking",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
}

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

type KarigarLedgerTableProps = {
  rows: KarigarLedgerRow[]
  finalFineGoldBalance: number
  finalCashBalance: number
  /** e.g. "Gold" or "Silver" — whichever metal this karigar's entries
   *  actually carry, so the labels below don't say "gold" for a
   *  silver-only karigar. See getKarigarLedger()'s own doc comment. */
  metalLabel: string
}

export function KarigarLedgerTable({
  rows,
  finalFineGoldBalance,
  finalCashBalance,
  metalLabel,
}: KarigarLedgerTableProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Fine {metalLabel} Balance (with karigar)
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
              <TableHead className="text-right">Running {metalLabel} Balance</TableHead>
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
                    <TableCell>
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
                                value:
                                  row.metalWeightFine !== null
                                    ? `${row.metalWeightFine.toFixed(3)} g`
                                    : null,
                              },
                              { label: "Amount", value: inr(row.amount) },
                            ],
                          },
                          {
                            fields: [
                              {
                                label: `${metalLabel} balance`,
                                value: `${row.runningFineGoldBalance.toFixed(3)} g`,
                              },
                              { label: "Cash balance", value: inr(row.runningCashBalance) },
                            ],
                          },
                        ]}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={isDebit ? "destructive" : "secondary"}>
                        {row.type}
                      </Badge>
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
