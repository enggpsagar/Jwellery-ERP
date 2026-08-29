"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { MonthlySalesTrend } from "@/lib/actions/dashboard-actions"

/**
 * Colours for the metals a jeweller actually stocks.
 *
 * Named metals get a fixed colour so gold is gold on every screen and does
 * not change band whenever the sales mix reorders the stack. Anything else
 * falls through to the chart palette, which is validated for contrast.
 */
const METAL_COLORS: Record<string, string> = {
  gold: "var(--chart-2)",
  silver: "var(--chart-1)",
  diamond: "var(--chart-4)",
  platinum: "var(--chart-1)",
  unspecified: "var(--chart-5)",
}

const FALLBACK_COLORS = [
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--chart-4)",
  "var(--chart-1)",
  "var(--chart-2)",
]

function colorFor(metal: string, index: number) {
  return (
    METAL_COLORS[metal.trim().toLowerCase()] ??
    FALLBACK_COLORS[index % FALLBACK_COLORS.length]
  )
}

/** Recharts keys cannot carry spaces safely in CSS var names. */
function slug(metal: string) {
  return metal.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()
}

const formatLakh = (v: number) => `₹${(v / 100000).toFixed(0)}L`

type SalesChartProps = {
  data: MonthlySalesTrend
}

export function SalesChart({ data }: SalesChartProps) {
  const { points, metals } = data

  const chartConfig = Object.fromEntries(
    metals.map((metal, index) => [
      metal,
      { label: metal, color: colorFor(metal, index) },
    ])
  ) satisfies ChartConfig

  // No metal recorded against anything sold: fall back to the single total
  // line rather than rendering an empty stack.
  const hasBreakdown = metals.length > 0

  const totalConfig = {
    sales: { label: "Sales", color: "var(--chart-1)" },
  } satisfies ChartConfig

  return (
    <Card className="gap-0">
      <CardHeader className="border-b [.border-b]:pb-5">
        <CardTitle>Monthly Sales Trend</CardTitle>
        <CardDescription>
          {hasBreakdown
            ? `Invoiced sales for the last 12 months, split by metal`
            : "Invoiced sales for the last 12 months"}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6">
        <ChartContainer
          config={hasBreakdown ? chartConfig : totalConfig}
          className="h-[280px] w-full"
        >
          <AreaChart data={points} margin={{ left: 4, right: 8, top: 8 }}>
            <defs>
              {hasBreakdown ? (
                metals.map((metal, index) => (
                  <linearGradient
                    key={metal}
                    id={`fill-${slug(metal)}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={colorFor(metal, index)}
                      stopOpacity={0.55}
                    />
                    <stop
                      offset="95%"
                      stopColor={colorFor(metal, index)}
                      stopOpacity={0.08}
                    />
                  </linearGradient>
                ))
              ) : (
                <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              )}
            </defs>

            <CartesianGrid vertical={false} strokeDasharray="3 3" />

            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={48}
              tickFormatter={formatLakh}
            />

            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  // Stacked, so the running total is what the reader is
                  // actually looking at as they scan down the list.
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground capitalize">
                        {name}
                      </span>
                      <span className="font-medium tabular-nums">
                        ₹{Number(value).toLocaleString("en-IN", {
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </div>
                  )}
                />
              }
            />

            {hasBreakdown ? (
              <>
                {metals.map((metal, index) => (
                  <Area
                    key={metal}
                    dataKey={metal}
                    // One stack, so the bands add up to the month's invoiced
                    // total rather than overlapping and hiding each other.
                    stackId="sales"
                    type="monotone"
                    fill={`url(#fill-${slug(metal)})`}
                    stroke={colorFor(metal, index)}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
                <ChartLegend content={<ChartLegendContent />} />
              </>
            ) : (
              <Area
                dataKey="sales"
                type="monotone"
                fill="url(#fillSales)"
                stroke="var(--chart-1)"
                strokeWidth={2.5}
                dot={false}
              />
            )}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
