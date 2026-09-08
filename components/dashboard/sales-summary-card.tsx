"use client"

import { useState, useTransition } from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import {
  getSalesBreakdown,
  type SalesBreakdown,
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

/** What each period drills down into — shown under the chart so the axis's
 * granularity is never ambiguous. */
const PERIOD_GRANULARITY: Record<SalesTrendPeriod, string> = {
  daily: "by hour, today",
  weekly: "by day, this week",
  monthly: "by day, this month",
  quarterly: "by month, this quarter",
  yearly: "by month, this year",
}

const PERIOD_OPTIONS = Object.keys(PERIOD_LABELS) as SalesTrendPeriod[]

// Same fixed palette/lookup as sales-chart.tsx, duplicated rather than
// imported since that file is a distinct "use client" component with its
// own copy of these labels already, by the same convention.
// Same literal hues as CategoryChart's own METAL_COLORS (dashboard/
// category-chart.tsx) — a metal reads as the same colour on every chart on
// this page, not a different one depending on which chart you're looking
// at.
const METAL_COLORS: Record<string, string> = {
  gold: "#D4AF37",
  silver: "#B0B7C1",
  diamond: "#7EC8E3",
  platinum: "#A8A9AD",
  unspecified: "#9CA3AF",
}

const FALLBACK_COLORS = [
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--chart-4)",
  "var(--chart-1)",
  "var(--chart-2)",
]

function colorFor(metal: string, index: number) {
  return METAL_COLORS[metal.trim().toLowerCase()] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

const compact = (v: number) =>
  v >= 100000
    ? `₹${(v / 100000).toFixed(1)}L`
    : v >= 1000
      ? `₹${(v / 1000).toFixed(0)}K`
      : `₹${v}`

type SalesSummaryCardProps = {
  initialData: SalesBreakdown
  initialPeriod: SalesTrendPeriod
}

/**
 * Replaces the old separate "Today's Sales" and "Monthly Revenue" KPI cards
 * with one Sales section carrying its own Daily/Weekly/Monthly/Quarterly/
 * Yearly toggle. Unlike the big Sales Trend chart (trailing whole periods),
 * this drills INTO the current period — Daily shows today's hours, Weekly
 * shows this week's days, and so on — stacked by metal, same breakdown
 * convention as Sales Trend/Revenue by Metal. currentTotal/previousTotal
 * come straight from getSalesBreakdown rather than being derived from the
 * chart's own bars, since the bars are sub-period buckets, not
 * period-over-period comparison points.
 */
export function SalesSummaryCard({ initialData, initialPeriod }: SalesSummaryCardProps) {
  const [period, setPeriod] = useState(initialPeriod)
  const [data, setData] = useState(initialData)
  const [isPending, startTransition] = useTransition()

  function handlePeriodChange(next: SalesTrendPeriod) {
    if (next === period) return
    setPeriod(next)
    startTransition(async () => {
      setData(await getSalesBreakdown(next))
    })
  }

  const { points, metals, currentTotal, previousTotal } = data
  const change =
    previousTotal === 0 ? (currentTotal === 0 ? 0 : 100) : ((currentTotal - previousTotal) / previousTotal) * 100
  const isUp = change >= 0

  const chartConfig = Object.fromEntries(
    metals.map((metal, index) => [metal, { label: metal, color: colorFor(metal, index) }])
  ) satisfies ChartConfig

  const hasBreakdown = metals.length > 0

  return (
    <Card className="h-full gap-0 py-0">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-muted-foreground">Sales</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight tabular-nums">
                ₹{currentTotal.toLocaleString("en-IN")}
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
              {PERIOD_SUB_LABELS[period]} · {PERIOD_GRANULARITY[period]}
            </span>
          </div>

          <div className="flex shrink-0 gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1">
            {PERIOD_OPTIONS.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={period === option ? "default" : "ghost"}
                disabled={isPending}
                onClick={() => handlePeriodChange(option)}
                className="h-7 shrink-0 whitespace-nowrap px-2.5 text-xs"
              >
                {PERIOD_LABELS[option]}
              </Button>
            ))}
          </div>
        </div>

        <div className="min-h-[150px] w-full flex-1">
          <ChartContainer config={chartConfig} className="h-full w-full">
            <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                interval="preserveStartEnd"
                minTickGap={20}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={38}
                tick={{ fontSize: 10 }}
                tickFormatter={compact}
              />
              <ChartTooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className="text-muted-foreground capitalize">{name}</span>
                        <span className="font-medium tabular-nums">
                          ₹{Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              {hasBreakdown ? (
                metals.map((metal, index) => (
                  <Bar
                    key={metal}
                    dataKey={metal}
                    stackId="sales"
                    fill={colorFor(metal, index)}
                    radius={index === metals.length - 1 ? [2, 2, 0, 0] : 0}
                  />
                ))
              ) : (
                <Bar dataKey="sales" fill="var(--chart-1)" radius={[2, 2, 0, 0]} />
              )}
            </BarChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  )
}
