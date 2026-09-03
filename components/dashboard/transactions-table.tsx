"use client"

import { useState, useTransition } from "react"
import {
  Card,
  CardAction,
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import Link from "next/link"
import {
  getRecentTransactions,
  type DashboardTransaction,
  type RecentTransactionsPeriod,
} from "@/lib/actions/dashboard-actions"
import { RecordHoverCard } from "@/components/shared/record-hover-card"

const statusStyles: Record<string, string> = {
  Paid: "bg-emerald-50 text-emerald-700",
  Pending: "bg-amber-50 text-amber-700",
  Partial: "bg-blue-50 text-blue-700",
  Cancelled: "bg-red-50 text-red-700",
}

// Kept in sync by convention with RecentTransactionsPeriod in
// dashboard-actions.ts — a "use server" file can only export async
// functions.
const PERIOD_LABELS: Record<RecentTransactionsPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
}

const PERIOD_OPTIONS = Object.keys(PERIOD_LABELS) as RecentTransactionsPeriod[]

type TransactionsTableProps = {
  initialTransactions: DashboardTransaction[]
  initialPeriod: RecentTransactionsPeriod
}

export function TransactionsTable({ initialTransactions, initialPeriod }: TransactionsTableProps) {
  const [period, setPeriod] = useState(initialPeriod)
  const [transactions, setTransactions] = useState(initialTransactions)
  const [isPending, startTransition] = useTransition()

  function handlePeriodChange(next: RecentTransactionsPeriod) {
    if (next === period) return
    setPeriod(next)
    startTransition(async () => {
      setTransactions(await getRecentTransactions(next))
    })
  }

  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="flex flex-col gap-3 border-b [.border-b]:pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Latest invoices and ledger entries</CardDescription>
          </div>
          <CardAction>
            <Button variant="outline" size="sm" asChild>
              <Link href="/billing">View all</Link>
            </Button>
          </CardAction>
        </div>

        <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
          {PERIOD_OPTIONS.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={period === option ? "default" : "ghost"}
              disabled={isPending}
              onClick={() => handlePeriodChange(option)}
              className="h-7 px-2.5 text-xs"
            >
              {PERIOD_LABELS[option]}
            </Button>
          ))}
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Metal</TableHead>
              <TableHead className="text-right">Weight</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  No transactions yet.
                </TableCell>
              </TableRow>
            )}
            {transactions.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium tabular-nums">
                  <Link href={`/billing/${t.invoiceId}`} className="hover:underline">
                    {t.id}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[180px] truncate">
                  <RecordHoverCard
                    label={t.customer}
                    href={`/billing/${t.invoiceId}`}
                    title={t.customer}
                    subtitle={t.id}
                    footerLabel="View invoice"
                    sections={[
                      {
                        fields: [
                          { label: "Date", value: t.date },
                          { label: "Type", value: t.type },
                          { label: "Status", value: t.status },
                        ],
                      },
                      {
                        fields: [
                          { label: "Metal", value: t.metal },
                          { label: "Weight", value: t.weight },
                          { label: "Amount", value: t.amount },
                        ],
                      },
                    ]}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground">{t.type}</TableCell>
                <TableCell className="text-muted-foreground">
                  {t.metal}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {t.weight}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {t.amount}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={cn("font-medium", statusStyles[t.status])}
                  >
                    {t.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}
