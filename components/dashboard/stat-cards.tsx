import {
  IndianRupee,
  TrendingUp,
  Wallet,
  Coins,
  Hammer,
  Truck,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { DashboardStat } from "@/lib/actions/dashboard-actions"

const iconMap = {
  rupee: IndianRupee,
  trending: TrendingUp,
  wallet: Wallet,
  metal: Coins,
  hammer: Hammer,
  truck: Truck,
}

/**
 * Icon tint per measure, drawn from the validated chart palette in
 * globals.css so the KPI row and the charts below it read as one system.
 *
 * These are decorative: the label beside each icon carries the meaning, so
 * nothing here depends on colour alone. Tints are the hue at low alpha over
 * the card surface, which keeps the icon itself well clear of the 3:1 the
 * hue would fail at full strength on white.
 */
const iconTint: Record<string, string> = {
  rupee: "var(--chart-3)",
  trending: "var(--chart-1)",
  wallet: "var(--chart-5)",
  metal: "var(--chart-2)",
  hammer: "var(--chart-4)",
  truck: "var(--chart-1)",
}

type StatCardsProps = {
  stats: DashboardStat[]
}

export function StatCards({ stats }: StatCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {stats.map((stat) => {
        const Icon = iconMap[stat.icon as keyof typeof iconMap]
        const tint = iconTint[stat.icon] ?? "var(--chart-1)"
        const isUp = stat.trend === "up"
        return (
          <Card key={stat.label} className="gap-0 py-0">
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex size-9 items-center justify-center rounded-lg ring-1 ring-inset"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${tint} 12%, transparent)`,
                      color: tint,
                      // @ts-expect-error -- CSS custom property
                      "--tw-ring-color": `color-mix(in oklab, ${tint} 22%, transparent)`,
                    }}
                  >
                    <Icon className="size-[18px]" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </span>
                </div>
                {stat.change && (
                  <span
                    className={cn(
                      "flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium",
                      isUp
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700",
                    )}
                  >
                    {isUp ? (
                      <ArrowUpRight className="size-3" />
                    ) : (
                      <ArrowDownRight className="size-3" />
                    )}
                    {stat.change}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span
                  className={cn(
                    "text-2xl font-semibold tracking-tight tabular-nums",
                    stat.tone === "outstanding" && "text-red-600",
                    stat.tone === "deposited" && "text-blue-600",
                  )}
                >
                  {stat.value}
                </span>
                <span className="text-xs text-muted-foreground">
                  {stat.sub}
                </span>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
