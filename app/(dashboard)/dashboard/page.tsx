import type { Metadata } from "next";

import { StatCards } from "@/components/dashboard/stat-cards";
import { SalesSummaryCard } from "@/components/dashboard/sales-summary-card";
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

// Every period-filterable dashboard section defaults to "Daily" — the most
// immediately relevant view for a store owner checking in on their own day.
const DEFAULT_SALES_TREND_PERIOD = "daily";
const DEFAULT_REVENUE_PERIOD = "daily";
const DEFAULT_TRANSACTIONS_PERIOD = "daily";

export default async function DashboardPage() {
  const [stats, salesTrend, revenueByCategory, transactions, activity] =
    await Promise.all([
      getDashboardStats(),
      getSalesTrend(DEFAULT_SALES_TREND_PERIOD),
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

      {/* Sales — merged Today's Sales / Monthly Revenue into one section
          with its own period filter, rather than two fixed-period cards. */}
      <SalesSummaryCard initialData={salesTrend} initialPeriod={DEFAULT_SALES_TREND_PERIOD} />

      {/* KPI Cards */}
      <StatCards stats={stats} />

      {/* Existing Dashboard Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SalesChart initialData={salesTrend} initialPeriod={DEFAULT_SALES_TREND_PERIOD} />
        </div>

        <div>
          <CategoryChart initialData={revenueByCategory} initialPeriod={DEFAULT_REVENUE_PERIOD} />
        </div>
      </div>

      {/* Transactions & Activity */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TransactionsTable
            initialTransactions={transactions}
            initialPeriod={DEFAULT_TRANSACTIONS_PERIOD}
          />
        </div>

        <div>
          <ActivityFeed activity={activity} />
        </div>
      </div>
    </main>
  );
}