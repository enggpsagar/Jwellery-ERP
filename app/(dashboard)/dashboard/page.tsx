import type { Metadata } from "next";

import { StatCards } from "@/components/dashboard/stat-cards";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { CategoryChart } from "@/components/dashboard/category-chart";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import {
  getDashboardStats,
  getSalesTrend,
  getRevenueByCategory,
  getRecentTransactions,
  getRecentActivity,
} from "@/lib/actions/dashboard-actions";

export const metadata: Metadata = {
  title: "Dashboard",
};

const DEFAULT_SALES_TREND_PERIOD = "monthly";

export default async function DashboardPage() {
  const [stats, salesTrend, revenueByCategory, transactions, activity] =
    await Promise.all([
      getDashboardStats(),
      getSalesTrend(DEFAULT_SALES_TREND_PERIOD),
      getRevenueByCategory(),
      getRecentTransactions(),
      getRecentActivity(),
    ]);

  const currentDate = new Date();

  const formattedDate = currentDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Dashboard
        </h1>

        <p className="text-sm text-muted-foreground">
          Overview of your store's performance for {formattedDate}.
        </p>
      </div>

      {/* KPI Cards */}
      <StatCards stats={stats} />

      {/* Existing Dashboard Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SalesChart initialData={salesTrend} initialPeriod={DEFAULT_SALES_TREND_PERIOD} />
        </div>

        <div>
          <CategoryChart data={revenueByCategory} />
        </div>
      </div>

      {/* Transactions & Activity */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TransactionsTable transactions={transactions} />
        </div>

        <div>
          <ActivityFeed activity={activity} />
        </div>
      </div>
    </main>
  );
}