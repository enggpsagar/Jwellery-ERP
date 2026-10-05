import type { getInvoiceOldGoldExchange } from "@/lib/actions/old-gold-actions"

export type PrintExchange = NonNullable<Awaited<ReturnType<typeof getInvoiceOldGoldExchange>>>

const fmt = (value: number) => value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** What the customer sold the shop, e.g. "Gold 22K 9.160 g pure, Diamond 0.50 ct". */
export function exchangeSummary(exchange: PrintExchange) {
  return exchange.lines
    .map((line) =>
      line.isGemstone
        ? `${line.metalName} ${(line.caratWeight ?? 0).toFixed(2)} ct`
        : `${[line.metalName, line.purity].filter(Boolean).join(" ")} ${line.fineWeight.toFixed(3)} g pure`,
    )
    .join(", ")
}

/** Money actually received on the bill — paidAmount also counts the exchange's applied value. */
export function cashReceived(paidAmount: number, exchange: PrintExchange | null | undefined) {
  return Math.max(0, paidAmount - (exchange?.applied ?? 0))
}

/**
 * Customer Exchange rows under a printed invoice's Total — what was bought
 * from the customer, the net payable after it, and any balance kept as
 * store credit or paid out (lib/old-gold/exchange.ts). Each template passes
 * its own row class so the rows match its totals box.
 */
export function PrintExchangeRows({
  exchange,
  invoiceTotal,
  rowClassName,
  netClassName,
}: {
  exchange?: PrintExchange | null
  invoiceTotal: number
  rowClassName: string
  netClassName?: string
}) {
  if (!exchange) return null
  return (
    <>
      <div className={rowClassName}>
        <span>
          Less: Bought from customer ({exchange.number})
          <span className="block text-[0.85em] opacity-75">{exchangeSummary(exchange)}</span>
        </span>
        <span className="whitespace-nowrap">-₹{fmt(exchange.applied)}</span>
      </div>
      <div className={netClassName ?? `${rowClassName} font-bold`}>
        <span>Net payable</span>
        <span className="whitespace-nowrap">₹{fmt(Math.max(0, invoiceTotal - exchange.applied))}</span>
      </div>
      {exchange.excess > 0 ? (
        <div className={rowClassName}>
          <span>{exchange.excessMode === "PAID_OUT" ? "Balance paid to customer" : "Balance kept as store credit"}</span>
          <span className="whitespace-nowrap">₹{fmt(exchange.excess)}</span>
        </div>
      ) : null}
    </>
  )
}
