import {
  IndianRupee,
  TrendingUp,
  Wallet,
  Coins,
  Medal,
  Gem,
  Award,
  Hammer,
  Truck,
  ArrowUpRight,
  ArrowDownRight,
  type LucideIcon,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { DashboardStat } from "@/lib/actions/dashboard-actions"

const iconMap: Record<string, LucideIcon> = {
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
 * nothing here depends on colour alone.
 */
const iconTint: Record<string, string> = {
  rupee: "var(--chart-3)",
  trending: "var(--chart-1)",
  wallet: "var(--chart-5)",
  metal: "var(--chart-2)",
  hammer: "var(--chart-4)",
  truck: "var(--chart-1)",
}

/**
 * A "Gold Stock"/"Silver Stock"/"Diamond Stock" card used to all render the
 * same Coins icon in the same tint (icon: "metal" has no per-metal
 * distinction on its own) — indistinguishable at a glance. Same literal hex
 * values as METAL_COLORS in category-chart.tsx/sales-chart.tsx/
 * sales-summary-card.tsx, so a metal reads as the same colour everywhere on
 * the dashboard.
 */
const METAL_ICON_BY_NAME: Record<string, LucideIcon> = {
  gold: Coins,
  silver: Medal,
  diamond: Gem,
  platinum: Award,
}

const METAL_COLOR_BY_NAME: Record<string, string> = {
  gold: "#D4AF37",
  silver: "#B0B7C1",
  diamond: "#7EC8E3",
  platinum: "#A8A9AD",
}

function metalIconFor(metalName: string | undefined): LucideIcon {
  return METAL_ICON_BY_NAME[metalName?.trim().toLowerCase() ?? ""] ?? Coins
}

function metalColorFor(metalName: string | undefined): string {
  return METAL_COLOR_BY_NAME[metalName?.trim().toLowerCase() ?? ""] ?? "#9CA3AF"
}

type StatCardsProps = {
  stats: DashboardStat[]
}

export function StatCards({ stats }: StatCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
      {stats.map((stat) => {
        const isMetal = stat.icon === "metal"
        const Icon = isMetal ? metalIconFor(stat.metalName) : iconMap[stat.icon]
        const tint = isMetal ? metalColorFor(stat.metalName) : (iconTint[stat.icon] ?? "var(--chart-1)")
        const isUp = stat.trend === "up"
        return (
          <Card key={stat.label} className="gap-0 py-0">
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex size-9 items-center justify-center rounded-lg text-white shadow-sm"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${tint} 60%, black)`,
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
