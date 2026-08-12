"use client"

import { Pie, PieChart } from "recharts"

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
import type { CategoryRevenue } from "@/lib/actions/dashboard-actions"

const chartConfig = {
  value: { label: "Revenue" },
} satisfies ChartConfig

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

type CategoryChartProps = {
  data: CategoryRevenue[]
}

export function CategoryChart({ data }: CategoryChartProps) {
  const chartData = data.map((c, i) => ({
    ...c,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }))
  const total = chartData.reduce((acc, c) => acc + c.value, 0)

  return (
    <Card className="gap-0">
      <CardHeader className="border-b [.border-b]:pb-5">
        <CardTitle>Revenue by Category</CardTitle>
        <CardDescription>This month&apos;s revenue split</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[200px]"
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
              innerRadius={56}
              outerRadius={84}
              strokeWidth={2}
            />
          </PieChart>
        </ChartContainer>

        {chartData.length === 0 && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            No sales recorded yet.
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2.5">
          {chartData.map((c) => (
            <div key={c.category} className="flex items-center gap-2.5 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: c.fill }}
              />
              <span className="flex-1 text-muted-foreground">{c.category}</span>
              <span className="font-medium tabular-nums">
                {((c.value / total) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
