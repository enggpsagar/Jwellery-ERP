import { Coins } from "lucide-react"

import { Fragment } from "react"

import { WeightText } from "@/components/shared/weight-text"
import type { QuotationExchangeEstimate, QuotationExchangeEstimateSummaryLine } from "@/lib/actions/quotation-actions"
import { DEFAULT_WEIGHT_FORMAT, type WeightFormat } from "@/lib/weight-calc"

// Display of a quotation's Customer Exchange ESTIMATE (Quotation.exchangeEstimate)
// — what the customer says they'll trade in. Nothing is bought from a
// quotation; it becomes a real exchange only on conversion to an invoice.
// The figures are the ones resolved when the quotation was saved.

const fmt = (value: number) => value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** How much of the estimate would come off this total (never more than it). */
export function estimateApplied(estimate: QuotationExchangeEstimate, total: number) {
  return Math.min(Math.max(estimate.total, 0), Math.max(total, 0))
}

/** "Gold 22K 9.160 g pure" / "Diamond 0.50 ct". */
export function estimateLineLabel(line: QuotationExchangeEstimateSummaryLine, wf: WeightFormat = DEFAULT_WEIGHT_FORMAT) {
  return line.isGemstone
    ? `${line.metalName} ${wf.stoneCarats(line.caratWeight ?? 0)}`
    : `${[line.metalName, line.purity].filter(Boolean).join(" ")} ${wf.grams(line.fineWeight)} pure`
}

/** estimateLineLabel with the store's weight decimals (Settings > Weights). */
function EstimateLineLabel({ line }: { line: QuotationExchangeEstimateSummaryLine }) {
  return line.isGemstone ? (
    <>
      {line.metalName} <WeightText value={line.caratWeight ?? 0} stone />
    </>
  ) : (
    <>
      {[line.metalName, line.purity].filter(Boolean).join(" ")} <WeightText value={line.fineWeight} /> pure
    </>
  )
}

/** On-screen card: one row per estimated item, with pure weight / carats and value. */
export function QuotationExchangeEstimateCard({
  estimate,
  quotationTotal,
}: {
  estimate: QuotationExchangeEstimate
  /** When given, the card also shows the estimated net payable. */
  quotationTotal?: number
}) {
  return (
    <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4" data-testid="quotation-exchange-estimate-card">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Coins className="h-4 w-4 text-amber-600" />
          Customer Exchange — estimate
        </p>
        <p className="text-xs text-muted-foreground">
          What the customer said they&apos;ll trade in. Nothing is bought until the quotation is converted to an invoice.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium">Item</th>
              <th className="px-3 py-2 text-left font-medium">Metal / stone</th>
              <th className="px-3 py-2 text-right font-medium">Net</th>
              <th className="px-3 py-2 text-right font-medium">Pure wt / carats</th>
              <th className="px-3 py-2 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {estimate.resolvedSummary.map((line, index) => (
              <tr key={index} className="border-b last:border-0">
                <td className="px-3 py-2">{line.description || "—"}</td>
                <td className="px-3 py-2">{[line.metalName, line.isGemstone ? null : line.purity].filter(Boolean).join(" ")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{line.isGemstone ? "—" : <WeightText value={line.netWeight} />}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {line.isGemstone ? <WeightText value={line.caratWeight ?? 0} stone /> : <WeightText value={line.fineWeight} />}
                  {!line.isGemstone && line.caratWeight ? (
                    <span className="block text-xs text-muted-foreground">
                      + <WeightText value={line.caratWeight} stone /> stone
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">₹{fmt(line.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
        <span>
          Estimated value: <span className="font-semibold">₹{fmt(estimate.total)}</span>
        </span>
        {quotationTotal != null && (
          <span>
            Net payable (estimate):{" "}
            <span className="font-semibold">₹{fmt(Math.max(0, quotationTotal - estimateApplied(estimate, quotationTotal)))}</span>
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Rows under a printed quotation's Total — "Less: old gold (estimate)" with
 * the items in small type, then "Net payable (estimate)". Each template
 * passes its own row class so they match its totals box.
 */
export function QuotationExchangeEstimateRows({
  estimate,
  total,
  rowClassName,
  netClassName,
}: {
  estimate?: QuotationExchangeEstimate | null
  total: number
  rowClassName: string
  netClassName?: string
}) {
  if (!estimate || !(estimate.total > 0)) return null
  const applied = estimateApplied(estimate, total)
  return (
    <>
      <div className={rowClassName}>
        <span>
          Less: old gold (estimate)
          <span className="block text-[0.85em] opacity-75">
            {estimate.resolvedSummary.map((line, index) => (
              <Fragment key={index}>
                {index > 0 ? ", " : ""}
                <EstimateLineLabel line={line} /> ₹{fmt(line.value)}
              </Fragment>
            ))}
          </span>
        </span>
        <span className="whitespace-nowrap">-₹{fmt(applied)}</span>
      </div>
      <div className={netClassName ?? `${rowClassName} font-bold`}>
        <span>Net payable (estimate)</span>
        <span className="whitespace-nowrap">₹{fmt(Math.max(0, total - applied))}</span>
      </div>
    </>
  )
}
