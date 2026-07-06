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
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { monthlySales } from "@/lib/data"

const chartConfig = {
  sales: { label: "Sales", color: "var(--chart-1)" },
  target: { label: "Target", color: "var(--chart-2)" },
} satisfies ChartConfig

const formatLakh = (v: number) => `₹${(v / 100000).toFixed(0)}L`

export function SalesChart() {
  return (
    <Card className="gap-0">
      <CardHeader className="border-b [.border-b]:pb-5">
        <CardTitle>Monthly Sales Trend</CardTitle>
        <CardDescription>
          Sales against target for the last 12 months
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <AreaChart data={monthlySales} margin={{ left: 4, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-sales)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-sales)" stopOpacity={0.02} />
              </linearGradient>
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
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground capitalize">
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
            <Area
              dataKey="target"
              type="monotone"
              fill="transparent"
              stroke="var(--color-target)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
            <Area
              dataKey="sales"
              type="monotone"
              fill="url(#fillSales)"
              stroke="var(--color-sales)"
              strokeWidth={2.5}
              dot={false}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
