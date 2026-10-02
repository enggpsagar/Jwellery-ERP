import type { Metadata } from "next"
import Link from "next/link"

import { getOldGoldExchanges } from "@/lib/actions/old-gold-actions"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatShortDate } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Old Gold",
}

export const dynamic = "force-dynamic"

const grams = (value: number) => `${value.toFixed(3)} g`
const rupees = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Every Old Gold Exchange — old gold bought from a customer while selling
 * them new jewellery (created from the New Invoice form). Each is a real
 * OG- purchase linked to its invoice; weights are shown physical and in
 * 24K fine terms.
 */
export default async function OldGoldPage() {
  const { rows, summary, truncated } = await getOldGoldExchanges()

  const cards = [
    { label: "Exchanges", value: String(summary.count) },
    { label: "Old gold received (net)", value: grams(summary.totalNet) },
    { label: "Received in 24K fine", value: grams(summary.totalFine) },
    { label: "Still in stock (24K fine)", value: grams(summary.inStockFine) },
    { label: "Total value paid", value: rupees(summary.totalValue) },
  ]

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Old Gold"
        description="Old gold taken from customers against new jewellery — each exchange is a purchase linked to its invoice."
        backHref="/billing"
        backLabel="Back to Billing"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-lg font-semibold">{card.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No old gold exchanges yet. Add one from{" "}
          <Link href="/billing/new" className="text-primary underline-offset-2 hover:underline">
            New Invoice
          </Link>{" "}
          → Old Gold Exchange.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exchange</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Old gold</TableHead>
                <TableHead className="text-right">Net Wt</TableHead>
                <TableHead className="text-right">24K Fine</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Against invoice</TableHead>
                <TableHead>Settled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="align-top">
                  <TableCell>
                    <Link href={`/purchases/${row.id}`} className="font-medium hover:underline">
                      {row.number}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{formatShortDate(new Date(row.dateISO))}</span>
                  </TableCell>
                  <TableCell>
                    <Link href={`/customers/${row.customerId}`} className="hover:underline">
                      {row.customerName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ul className="space-y-1 text-sm">
                      {row.lines.map((line) => (
                        <li key={line.id}>
                          {line.description} · {line.metalName} {line.purity}
                          <span className="block text-xs text-muted-foreground">
                            {grams(line.netWeight)} → {grams(line.fineWeight)} 24K × {rupees(line.rate)}
                            {line.deductionPercent > 0 ? ` − ${line.deductionPercent}%` : ""} = {rupees(line.value)}
                            {line.inStock ? "" : " · out of stock"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell className="text-right">{grams(row.totalNet)}</TableCell>
                  <TableCell className="text-right font-medium">{grams(row.totalFine)}</TableCell>
                  <TableCell className="text-right font-medium">{rupees(row.value)}</TableCell>
                  <TableCell>
                    {row.invoiceId ? (
                      <Link href={`/billing/${row.invoiceId}`} className="hover:underline">
                        {row.invoiceNumber}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Invoice deleted</span>
                    )}
                    {row.invoiceStatus === "CANCELLED" ? (
                      <Badge variant="outline" className="ml-1">Cancelled</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="block">Against bill: {rupees(row.applied)}</span>
                    {row.excess > 0 ? (
                      <span className="block text-emerald-700">
                        {row.excessMode === "PAID_OUT" ? "Paid out" : "Store credit"}: {rupees(row.excess)}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {truncated ? (
        <p className="text-xs text-muted-foreground">Showing the latest 300 exchanges; totals above cover all of them.</p>
      ) : null}
    </main>
  )
}
