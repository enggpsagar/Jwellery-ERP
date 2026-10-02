import Link from "next/link"

import type { getInvoiceOldGoldExchange } from "@/lib/actions/old-gold-actions"

type Exchange = NonNullable<Awaited<ReturnType<typeof getInvoiceOldGoldExchange>>>

const grams = (value: number) => `${value.toFixed(3)} g`
const rupees = (value: number) => `₹${value.toFixed(2)}`

/** Old gold the customer traded in against this invoice, and the net
 *  amount they paid after it — see lib/old-gold/exchange.ts. */
export function InvoiceOldGoldCard({ exchange, invoiceTotal }: { exchange: Exchange; invoiceTotal: number }) {
  return (
    <section className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Old Gold Exchange</h2>
        <Link href={`/purchases/${exchange.id}`} className="text-sm text-primary hover:underline">
          {exchange.number}
        </Link>
      </div>
      <ul className="space-y-1 text-sm">
        {exchange.lines.map((line) => (
          <li key={line.id} className="flex flex-wrap justify-between gap-2">
            <span>
              {line.description} · {line.metalName} {line.purity} — {grams(line.netWeight)} → {grams(line.fineWeight)} 24K ×{" "}
              {rupees(line.rate)}
              {line.deductionPercent > 0 ? ` − ${line.deductionPercent}%` : ""}
            </span>
            <span className="font-medium">{rupees(line.value)}</span>
          </li>
        ))}
      </ul>
      <div className="space-y-1 border-t pt-2 text-sm">
        <div className="flex justify-between">
          <span>Invoice total</span>
          <span>{rupees(invoiceTotal)}</span>
        </div>
        <div className="flex justify-between text-amber-700">
          <span>Less: old gold (value {rupees(exchange.value)})</span>
          <span>-{rupees(exchange.applied)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Net payable by customer</span>
          <span>{rupees(Math.max(0, invoiceTotal - exchange.applied))}</span>
        </div>
        {exchange.excess > 0 ? (
          <div className="flex justify-between text-emerald-700">
            <span>{exchange.excessMode === "PAID_OUT" ? "Old gold balance paid to customer" : "Old gold balance kept as store credit"}</span>
            <span>{rupees(exchange.excess)}</span>
          </div>
        ) : null}
      </div>
    </section>
  )
}
