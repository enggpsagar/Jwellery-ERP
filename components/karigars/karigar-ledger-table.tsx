import type { KarigarLedgerRow, KarigarLedgerMetalGroup } from "@/lib/actions/ledger-actions"
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
  finalCashBalance: number
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
}: {
  title: string
  rows: KarigarLedgerRow[]
  metalLabel: string
}) {
  const total = rows.reduce((sum, row) => sum + (row.metalWeightFine ?? 0), 0)

  return (
    <div className="flex-1 space-y-2">
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-sm font-medium tabular-nums">{total.toFixed(3)}g</span>
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
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No entries yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
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
      </div>
    </div>
  )
}

function MetalGroupSection({ group }: { group: KarigarLedgerMetalGroup }) {
  const issuedRows = group.rows.filter((row) => row.type === "DEBIT")
  const receivedRows = group.rows.filter((row) => row.type === "CREDIT")

  // Positive balance = more issued than received back — the metal is still
  // with the karigar, i.e. the karigar owes it to the store. A negative
  // balance (more received than ever issued — an adjustment/correction
  // case) means the reverse.
  const owesLabel =
    group.finalFineBalance > 0
      ? `Karigar owes you ${group.finalFineBalance.toFixed(3)}g of ${group.metalLabel}`
      : group.finalFineBalance < 0
        ? `You owe the karigar ${Math.abs(group.finalFineBalance).toFixed(3)}g of ${group.metalLabel}`
        : `Settled — no ${group.metalLabel} outstanding either way`

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h3 className="text-base font-semibold">{group.metalLabel}</h3>

      <div className="flex flex-col gap-4 lg:flex-row">
        <MaterialSideTable
          title="Gold Given to Karigar"
          rows={issuedRows}
          metalLabel={group.metalLabel}
        />
        <MaterialSideTable
          title="Material Received from Karigar"
          rows={receivedRows}
          metalLabel={group.metalLabel}
        />
      </div>

      <Card
        className={
          group.finalFineBalance > 0
            ? "border-red-200 bg-red-50"
            : group.finalFineBalance < 0
              ? "border-emerald-200 bg-emerald-50"
              : undefined
        }
      >
        <CardContent className="flex items-center justify-between py-3">
          <span className="text-sm font-medium text-muted-foreground">Net Balance</span>
          <span
            className={
              group.finalFineBalance > 0
                ? "text-base font-semibold text-red-700"
                : group.finalFineBalance < 0
                  ? "text-base font-semibold text-emerald-700"
                  : "text-base font-semibold"
            }
          >
            {owesLabel}
          </span>
        </CardContent>
      </Card>
    </div>
  )
}

export function KarigarLedgerTable({
  rows,
  finalCashBalance,
  materialGroups,
  variant,
}: KarigarLedgerTableProps) {
  if (variant === "material") {
    if (materialGroups.length === 0) {
      return (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          No material ledger entries yet.
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {materialGroups.map((group) => (
          <MetalGroupSection key={group.metalTypeId ?? "unassigned"} group={group} />
        ))}
      </div>
    )
  }

  const visibleRows = rows.filter((row) => row.amount !== null)

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

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Cash Amount</TableHead>
              <TableHead className="text-right">Running Cash Balance</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No financial ledger entries yet.
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row) => {
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
