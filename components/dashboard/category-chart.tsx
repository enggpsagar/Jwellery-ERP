"use client"

import { useState, useTransition } from "react"
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import {
  getRevenueByCategory,
  type RevenueByMetal,
  type RevenueByMetalPeriod,
} from "@/lib/actions/dashboard-actions"

const chartConfig = {
  value: { label: "Revenue" },
} satisfies ChartConfig

// Kept in sync by convention with RevenueByMetalPeriod in
// dashboard-actions.ts, same as sales-chart.tsx's own copy of these labels —
// a "use server" file can only export async functions.
const PERIOD_LABELS: Record<RevenueByMetalPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
}

const PERIOD_DESCRIPTIONS: Record<RevenueByMetalPeriod, string> = {
  daily: "Today's revenue split",
  weekly: "This week's revenue split",
  monthly: "This month's revenue split",
  quarterly: "This quarter's revenue split",
  yearly: "This year's revenue split",
}

const PERIOD_OPTIONS = Object.keys(PERIOD_LABELS) as RevenueByMetalPeriod[]

/**
 * Fixed slot order, never cycled. These are the validated jewellery hues from
 * globals.css; a 6th category folds into "Other" below rather than inventing
 * a hue, which would land outside the validated set.
 */
const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

const MAX_SLICES = CHART_COLORS.length

const compact = (v: number) =>
  v >= 100000
    ? `₹${(v / 100000).toFixed(1)}L`
    : v >= 1000
      ? `₹${(v / 1000).toFixed(0)}K`
      : `₹${v}`

type CategoryChartProps = {
  initialData: RevenueByMetal
  initialPeriod: RevenueByMetalPeriod
}

/**
 * Horizontal bar, not the donut this used to be.
 *
 * Two reasons. A donut compares every slice against every other, and on that
 * all-pairs test the palette fails outright (normal-vision ΔE 12.9 between two
 * of the five, below the 15 floor) — a bar chart only needs adjacent pairs to
 * separate, which the palette passes at 8.4. And part-to-whole across several
 * named categories reads better as a bar: lengths are directly comparable,
 * where slice angles are not.
 *
 * Category names sit on the axis, so identity never depends on colour, and the
 * value labels are also the "relief" the palette's gold slot requires — it
 * falls below 3:1 against the light surface.
 */
export function CategoryChart({ initialData, initialPeriod }: CategoryChartProps) {
  const [period, setPeriod] = useState(initialPeriod)
  const [data, setData] = useState(initialData)
  const [isPending, startTransition] = useTransition()

  function handlePeriodChange(next: RevenueByMetalPeriod) {
    if (next === period) return
    setPeriod(next)
    startTransition(async () => {
      setData(await getRevenueByCategory(next))
    })
  }

  const sorted = [...data.rows].sort((a, b) => b.value - a.value)

  // Anything past the fixed slots is summed into one bar rather than given a
  // colour outside the validated set.
  const head = sorted.slice(0, MAX_SLICES)
  const tail = sorted.slice(MAX_SLICES)
  const rows =
    tail.length > 0
      ? [
          ...head,
          {
            category: `Other (${tail.length})`,
            value: tail.reduce((sum, c) => sum + c.value, 0),
          },
        ]
      : head

  const chartData = rows.map((c, i) => ({
    ...c,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }))

  const total = chartData.reduce((acc, c) => acc + c.value, 0)

  return (
    <Card className="gap-0">
      <CardHeader className="flex flex-col gap-3 border-b [.border-b]:pb-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <CardTitle>Revenue by Metal</CardTitle>
            <CardDescription>{PERIOD_DESCRIPTIONS[period]}</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-semibold tabular-nums">
              ₹{data.total.toLocaleString("en-IN")}
            </p>
          </div>
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

      <CardContent className="pt-6">
        {chartData.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No sales recorded yet.
          </p>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className="h-[240px] w-full"
            >
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 4, right: 56, top: 4, bottom: 4 }}
                barCategoryGap={10}
              >
                {/* Recessive grid: reference, not furniture. */}
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="category"
                  tickLine={false}
                  axisLine={false}
                  width={104}
                  tickMargin={8}
                  tick={{ fontSize: 12 }}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name) => (
                        <div className="flex w-full items-center justify-between gap-3">
                          <span className="capitalize text-muted-foreground">
                            {name}
                          </span>
                          <span className="font-medium tabular-nums">
                            ₹{Number(value).toLocaleString("en-IN")}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                {/* 4px rounded data-end, square against the baseline. */}
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  <LabelList
                    dataKey="value"
                    position="right"
                    offset={8}
                    className="fill-foreground"
                    fontSize={11}
                    formatter={(v: unknown) => compact(Number(v))}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>

            {/* Table view: the share each category holds, which lengths alone
                don't give, and the accessible fallback for the chart. */}
            <div className="mt-5 flex flex-col gap-2 border-t pt-4">
              {chartData.map((c) => (
                <div
                  key={c.category}
                  className="flex items-center gap-2.5 text-sm"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: c.fill }}
                  />
                  <span className="flex-1 truncate text-muted-foreground">
                    {c.category}
                  </span>
                  <span className="font-medium tabular-nums">
                    {total > 0 ? ((c.value / total) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
