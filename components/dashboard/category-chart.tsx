"use client"

import { useState, useTransition } from "react"
import { Cell, Pie, PieChart } from "recharts"

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

const RADIAN = Math.PI / 180

/**
 * Percentage only, drawn inside the wedge rather than outside it — an
 * outside label on a large slice (e.g. 68%) can sit far enough left/up to
 * clip against the chart's own bounding box. Category names stay in the
 * tooltip and the legend table below instead of risking that overflow.
 * Skipped for slivers too small to hold readable text.
 */
function renderPieSliceLabel(props: {
  cx?: number
  cy?: number
  midAngle?: number
  innerRadius?: number
  outerRadius?: number
  percent?: number
}) {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 } = props
  if (percent < 0.05) return null

  const radius = innerRadius + (outerRadius - innerRadius) * 0.6
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fill="#fff"
      fontSize={12}
      fontWeight={600}
      paintOrder="stroke"
      stroke="rgba(0,0,0,0.35)"
      strokeWidth={3}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

type CategoryChartProps = {
  initialData: RevenueByMetal
  initialPeriod: RevenueByMetalPeriod
}

/**
 * Pie chart, per explicit request. An earlier pass moved this to a
 * horizontal bar because the 5-colour palette fails an all-pairs contrast
 * test a donut's adjacent-and-opposite slices both rely on (two colours sit
 * below the ΔE 15 floor). Back on a pie now, every slice still carries its
 * own category + percentage label directly on the wedge — and the table
 * below repeats category/percentage in text — so identity never depends on
 * colour alone even though the chart form does.
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
    <Card className="h-full gap-0">
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

      <CardContent className="flex flex-1 flex-col pt-6">
        {chartData.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">No sales recorded yet.</p>
          </div>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className="mx-auto aspect-square h-[240px]"
            >
              <PieChart>
                <ChartTooltip
                  cursor={false}
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
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="category"
                  outerRadius={95}
                  labelLine={false}
                  label={renderPieSliceLabel}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.category} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
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
