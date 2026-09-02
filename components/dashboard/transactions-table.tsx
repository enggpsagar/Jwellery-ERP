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
import type { DashboardTransaction } from "@/lib/actions/dashboard-actions"
import { RecordHoverCard } from "@/components/shared/record-hover-card"

const statusStyles: Record<string, string> = {
  Paid: "bg-emerald-50 text-emerald-700",
  Pending: "bg-amber-50 text-amber-700",
  Partial: "bg-blue-50 text-blue-700",
  Cancelled: "bg-red-50 text-red-700",
}

type TransactionsTableProps = {
  transactions: DashboardTransaction[]
}

export function TransactionsTable({ transactions }: TransactionsTableProps) {
  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="border-b [.border-b]:pb-5">
        <CardTitle>Recent Transactions</CardTitle>
        <CardDescription>Latest invoices and ledger entries</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <Link href="/billing">View all</Link>
          </Button>
        </CardAction>
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
