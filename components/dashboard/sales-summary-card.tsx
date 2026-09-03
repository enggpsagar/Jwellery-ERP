"use client"

import { useState, useTransition } from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { Area, AreaChart, ResponsiveContainer } from "recharts"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  getSalesTrend,
  type SalesTrend,
  type SalesTrendPeriod,
} from "@/lib/actions/dashboard-actions"

// Kept in sync by convention with SalesTrendPeriod in dashboard-actions.ts,
// same as sales-chart.tsx's own copy of these labels — a "use server" file
// can only export async functions.
const PERIOD_LABELS: Record<SalesTrendPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
}

const PERIOD_SUB_LABELS: Record<SalesTrendPeriod, string> = {
  daily: "vs yesterday",
  weekly: "vs last week",
  monthly: "vs last month",
  quarterly: "vs last quarter",
  yearly: "vs last year",
}

const PERIOD_OPTIONS = Object.keys(PERIOD_LABELS) as SalesTrendPeriod[]

/** How many trailing buckets the sparkline shows — enough to read a shape
 * without crowding a card this small. */
const SPARKLINE_LENGTH = 8

type SalesSummaryCardProps = {
  initialData: SalesTrend
  initialPeriod: SalesTrendPeriod
}

/**
 * Replaces the old separate "Today's Sales" and "Monthly Revenue" KPI cards
 * with one Sales section carrying its own Weekly/Monthly/Quarterly/Yearly
 * toggle. Reuses getSalesTrend's own bucketed series rather than a separate
 * query — the last bucket in `points` is always the current, still-in-
 * progress period, and the one before it the prior period, exactly what
 * "Today's Sales" (today vs yesterday) and "Monthly Revenue" (this month vs
 * last) each used to compute individually per period.
 */
export function SalesSummaryCard({ initialData, initialPeriod }: SalesSummaryCardProps) {
  const [period, setPeriod] = useState(initialPeriod)
  const [data, setData] = useState(initialData)
  const [isPending, startTransition] = useTransition()

  function handlePeriodChange(next: SalesTrendPeriod) {
    if (next === period) return
    setPeriod(next)
    startTransition(async () => {
      setData(await getSalesTrend(next))
    })
  }

  const { points } = data
  const current = points[points.length - 1]?.sales ?? 0
  const previous = points[points.length - 2]?.sales ?? 0
  const change =
    previous === 0 ? (current === 0 ? 0 : 100) : ((current - previous) / previous) * 100
  const isUp = change >= 0
  const sparkline = points.slice(-SPARKLINE_LENGTH)

  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-muted-foreground">Sales</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight tabular-nums">
                ₹{current.toLocaleString("en-IN")}
              </span>
              <span
                className={cn(
                  "flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium",
                  isUp ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
                )}
              >
                {isUp ? (
                  <ArrowUpRight className="size-3" />
                ) : (
                  <ArrowDownRight className="size-3" />
                )}
                {isUp ? "+" : ""}
                {change.toFixed(1)}%
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {PERIOD_SUB_LABELS[period]}
            </span>
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
        </div>

        <div className="h-14 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="fillSalesSummary" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area
                dataKey="sales"
                type="monotone"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#fillSalesSummary)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
