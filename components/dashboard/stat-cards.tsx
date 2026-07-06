import {
  IndianRupee,
  TrendingUp,
  Wallet,
  CircleDollarSign,
  Coins,
  Hammer,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { stats } from "@/lib/data"

const iconMap = {
  rupee: IndianRupee,
  trending: TrendingUp,
  wallet: Wallet,
  gold: CircleDollarSign,
  silver: Coins,
  hammer: Hammer,
}

export function StatCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {stats.map((stat) => {
        const Icon = iconMap[stat.icon as keyof typeof iconMap]
        const isUp = stat.trend === "up"
        return (
          <Card key={stat.label} className="gap-0 py-0">
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-[18px]" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </span>
                </div>
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
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-semibold tracking-tight tabular-nums">
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
