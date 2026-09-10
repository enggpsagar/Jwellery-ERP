import type { Metadata } from "next";

import { StatCards } from "@/components/dashboard/stat-cards";
import { SalesSummaryCard } from "@/components/dashboard/sales-summary-card";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { CategoryChart } from "@/components/dashboard/category-chart";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";
import {
  getDashboardStats,
  getSalesTrend,
  getSalesBreakdown,
  getRevenueByCategory,
  getRecentTransactions,
  getRecentActivity,
} from "@/lib/actions/dashboard-actions";

export const metadata: Metadata = {
  title: "Dashboard",
};

// Every period-filterable dashboard section defaults to "Monthly".
const DEFAULT_SALES_TREND_PERIOD = "monthly";
const DEFAULT_REVENUE_PERIOD = "monthly";
const DEFAULT_TRANSACTIONS_PERIOD = "monthly";

export default async function DashboardPage() {
  const [stats, salesTrend, salesBreakdown, revenueByCategory, transactions, activity] =
    await Promise.all([
      getDashboardStats(),
      getSalesTrend(DEFAULT_SALES_TREND_PERIOD),
      getSalesBreakdown(DEFAULT_SALES_TREND_PERIOD),
      getRevenueByCategory(DEFAULT_REVENUE_PERIOD),
      getRecentTransactions(DEFAULT_TRANSACTIONS_PERIOD),
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

      <DashboardGrid
        widgets={{
          salesSummary: (
            <SalesSummaryCard initialData={salesBreakdown} initialPeriod={DEFAULT_SALES_TREND_PERIOD} />
          ),
          statCards: <StatCards stats={stats} />,
          salesChart: <SalesChart initialData={salesTrend} initialPeriod={DEFAULT_SALES_TREND_PERIOD} />,
          categoryChart: (
            <CategoryChart initialData={revenueByCategory} initialPeriod={DEFAULT_REVENUE_PERIOD} />
          ),
          transactions: (
            <TransactionsTable
              initialTransactions={transactions}
              initialPeriod={DEFAULT_TRANSACTIONS_PERIOD}
            />
          ),
          activityFeed: <ActivityFeed activity={activity} />,
        }}
      />
    </main>
  );
}