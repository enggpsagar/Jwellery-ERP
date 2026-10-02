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
  title: "Bought from Customers",
}

export const dynamic = "force-dynamic"

const grams = (value: number) => `${value.toFixed(3)} g`
const rupees = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Purchases → From Customers: every Customer Exchange — gold, silver or
 * diamonds bought from a customer while selling them new jewellery (created
 * from the New Invoice form). Each is a real purchase linked to its invoice;
 * metal is shown physical and in pure (24K / 999) terms.
 */
export default async function CustomerExchangesPage() {
  const { rows, summary, truncated } = await getOldGoldExchanges()

  const cards = [
    { label: "Exchanges", value: String(summary.count) },
    { label: "Metal received (net)", value: grams(summary.totalNet) },
    { label: "Received pure (24K / 999)", value: grams(summary.totalFine) },
    { label: "Still in stock (pure)", value: grams(summary.inStockFine) },
    { label: "Total value paid", value: rupees(summary.totalValue) },
  ]

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Bought from Customers"
        description="Gold, silver and diamonds bought from customers against new jewellery — each is a purchase linked to its invoice."
        backHref="/purchases"
        backLabel="Back to Purchases"
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
          Nothing bought from customers yet. Add it from{" "}
          <Link href="/billing/new" className="text-primary underline-offset-2 hover:underline">
            New Invoice
          </Link>{" "}
          → Customer Exchange.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exchange</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Items bought</TableHead>
                <TableHead className="text-right">Net Wt</TableHead>
                <TableHead className="text-right">Pure (24K / 999)</TableHead>
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
                            {line.isGemstone
                              ? `${(line.caratWeight ?? 0).toFixed(3)} ct × ${rupees(line.rate)}/ct`
                              : `${grams(line.netWeight)} → ${grams(line.fineWeight)} pure × ${rupees(line.rate)}`}
                            {line.deductionPercent > 0 ? ` − ${line.deductionPercent}%` : ""}
                            {line.stone
                              ? ` + stone ${line.stone.name}${line.stone.caratWeight ? ` ${line.stone.caratWeight} ct` : ""} ${rupees(line.stone.value)}`
                              : ""}{" "}
                            = {rupees(line.value)}
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
