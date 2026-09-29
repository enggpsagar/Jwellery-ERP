"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker"
import {
  getBestSellers,
  type BestSellers,
  type RevenueByMetalPeriod,
} from "@/lib/actions/dashboard-actions"
import { cn, formatShortDate } from "@/lib/utils"

// Same period set/labels as category-chart.tsx (a "use server" file can
// only export async functions, so each client card keeps its own copy).
const PERIOD_LABELS: Record<RevenueByMetalPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
}

const PERIOD_DESCRIPTIONS: Record<RevenueByMetalPeriod, string> = {
  daily: "Top sellers today",
  weekly: "Top sellers this week",
  monthly: "Top sellers this month",
  quarterly: "Top sellers this quarter",
  yearly: "Top sellers this year",
}

const PERIOD_OPTIONS = Object.keys(PERIOD_LABELS) as RevenueByMetalPeriod[]

const NO_RANGE: DateRangeValue = { from: "", to: "" }

function rangeDescription({ from, to }: DateRangeValue) {
  if (from && to) return `Top sellers ${formatShortDate(from)} – ${formatShortDate(to)}`
  if (from) return `Top sellers since ${formatShortDate(from)}`
  return `Top sellers up to ${formatShortDate(to)}`
}

const TABS = [
  { key: "items", label: "Items" },
  { key: "categories", label: "Categories" },
  { key: "types", label: "Types" },
  { key: "metals", label: "Metals" },
  { key: "stones", label: "Stones" },
] as const

type TabKey = (typeof TABS)[number]["key"]

const EMPTY_TEXT: Record<TabKey, string> = {
  items: "No items sold in this period.",
  categories: "No sales with a category in this period.",
  types: "No sales with a category type in this period.",
  metals: "No metal sales in this period.",
  stones: "No stone sales in this period.",
}

/**
 * Best-selling Items / Categories / Types / Metals / Stones, ranked by
 * revenue with pieces sold alongside (getBestSellers). One accent colour
 * for every bar — the bars only encode each row's share of the top seller,
 * so colour carries no category meaning here.
 */
export function BestSellersCard({
  initialData,
  initialPeriod,
}: {
  initialData: BestSellers
  initialPeriod: RevenueByMetalPeriod
}) {
  const [period, setPeriod] = useState(initialPeriod)
  const [data, setData] = useState(initialData)
  const [tab, setTab] = useState<TabKey>("items")
  // A custom range replaces the period (see getBestSellers); picking a
  // period button again clears it.
  const [range, setRange] = useState<DateRangeValue>(NO_RANGE)
  // The range the list actually shows — lags `range` while only a start
  // date has been clicked, so the description never runs ahead of the data.
  const [appliedRange, setAppliedRange] = useState<DateRangeValue>(NO_RANGE)
  const [isPending, startTransition] = useTransition()
  const hasRange = Boolean(appliedRange.from || appliedRange.to)

  function handlePeriodChange(next: RevenueByMetalPeriod) {
    if (next === period && !hasRange) return
    setPeriod(next)
    setRange(NO_RANGE)
    setAppliedRange(NO_RANGE)
    startTransition(async () => {
      setData(await getBestSellers(next))
    })
  }

  function handleRangeChange(next: DateRangeValue) {
    setRange(next)
    // The picker reports the first click (start date only) before the end
    // is chosen — reload once the range is complete.
    if (next.from && !next.to) return
    setAppliedRange(next)
    startTransition(async () => {
      setData(await getBestSellers(period, next.from || next.to ? next : undefined))
    })
  }

  const rows = data[tab]
  const top = rows[0]?.revenue ?? 0

  return (
    <Card className="h-full gap-0">
      <CardHeader className="flex flex-col gap-3 border-b [.border-b]:pb-5">
        <div>
          <CardTitle>Best Sellers</CardTitle>
          <CardDescription>
            {hasRange ? rangeDescription(appliedRange) : PERIOD_DESCRIPTIONS[period]}, by revenue
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
            {PERIOD_OPTIONS.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={period === option && !hasRange ? "default" : "ghost"}
                disabled={isPending}
                onClick={() => handlePeriodChange(option)}
                className="h-7 px-2.5 text-xs"
              >
                {PERIOD_LABELS[option]}
              </Button>
            ))}
          </div>
          <DateRangePicker
            value={range}
            onChange={handleRangeChange}
            placeholder="Date range"
            className="w-[220px]"
          />
        </div>

        <div className="flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Best sellers by">
          {TABS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={tab === option.key}
              onClick={() => setTab(option.key)}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                tab === option.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className={cn("flex flex-1 flex-col pt-4", isPending && "opacity-60")}>
        {rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">{EMPTY_TEXT[tab]}</p>
          </div>
        ) : (
          <ol className="flex flex-col gap-3" aria-label={`Best-selling ${tab}`}>
            {rows.map((row, index) => (
              <li key={row.label} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="w-5 shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium" title={row.label}>
                    {row.label}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {row.quantity} pc{row.quantity === 1 ? "" : "s"}
                  </span>
                  <span className="w-24 shrink-0 text-right font-semibold tabular-nums">
                    ₹{Math.round(row.revenue).toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${top > 0 ? Math.max(2, (row.revenue / top) * 100) : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
