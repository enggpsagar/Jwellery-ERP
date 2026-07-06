import { StatCards } from "@/components/dashboard/stat-cards"
import { SalesChart } from "@/components/dashboard/sales-chart"
import { CategoryChart } from "@/components/dashboard/category-chart"
import { TransactionsTable } from "@/components/dashboard/transactions-table"
import { ActivityFeed } from "@/components/dashboard/activity-feed"

export default function DashboardPage() {
  const currentDate = new Date()

  const formattedDate = currentDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your store&apos;s performance for {formattedDate}.
        </p>
      </div>

      <StatCards />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SalesChart />
        </div>
        <div>
          <CategoryChart />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TransactionsTable />
        </div>
        <div>
          <ActivityFeed />
        </div>
      </div>
    </main>
  )
}