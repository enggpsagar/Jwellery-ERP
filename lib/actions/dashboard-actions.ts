// FILE PATH: lib/actions/dashboard-actions.ts
"use server";

import { InventoryStockStatus, InvoiceStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { getLocationScope, locationWhere } from "@/lib/location-scope";

/**
 * What counts as metal still on hand.
 *
 * Selling a piece (via an invoice or a kacha slip) flips its stock row to
 * SOLD; it is never deleted. So a sum that filters only on `isActive` keeps
 * counting metal that has already left the shop, and the figure only ever
 * grows — purchases add to it and sales never take anything away.
 *
 * RESERVED is included because the piece is physically still here, just
 * earmarked. ISSUED_TO_KARIGAR is deliberately excluded: that metal is out
 * with a goldsmith and is reported separately as "Still with Karigar", and
 * counting it here would double-count it against that figure. DAMAGED and
 * ARCHIVED are not sellable stock.
 *
 * Same definition as "Remaining Stock" in `getGoldFlowReport`
 * (lib/actions/report-actions.ts), so the Dashboard and Reports cannot
 * disagree about how much metal the store holds.
 */
const ON_HAND_STOCK_STATUSES = [
  InventoryStockStatus.IN_STOCK,
  InventoryStockStatus.RESERVED,
];

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export type DashboardStat = {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
  sub: string;
  icon: "rupee" | "trending" | "wallet" | "metal" | "hammer" | "truck";
  /** Colors the value red/blue for an outstanding-vs-deposited figure — omitted for stats that are neither (revenue, stock weight, etc). */
  tone?: "outstanding" | "deposited";
};

export type MetalStockStat = {
  metalId: string;
  metalName: string;
  grams: number;
};

export async function getDashboardStats(): Promise<DashboardStat[]> {
  const storeId = await requireStoreScope();
  const scope = await getLocationScope();
  const now = new Date();
  const todayStart = startOfDay(now);

  const activeMetals = await prisma.storeMetal.findMany({
    where: { storeId, isActive: true },
  });

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const [
    outstandingAgg,
    outstandingKachaAgg,
    todayPurchasesAgg,
    totalPurchasesAgg,
    metalStockAggs,
    pendingJobs,
    overdueJobs,
  ] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        storeId,
        balanceAmount: { gt: 0 },
        status: { not: InvoiceStatus.CANCELLED },
        ...locationWhere(scope),
      },
      _sum: { balanceAmount: true },
      _count: true,
    }),
    // A customer's Kacha slip balance is owed exactly the same as an
    // invoice's — it just hasn't been converted to a Pakka invoice yet.
    // Without this, "Outstanding Receivables" under-reports real dues and
    // disagrees with the Ledger, which already counts both (each creates
    // its own balance-due LedgerEntry).
    prisma.kachaInvoice.aggregate({
      where: { storeId, balanceAmount: { gt: 0 }, ...locationWhere(scope) },
      _sum: { balanceAmount: true },
      _count: true,
    }),
    // Bounded above unlike the sales queries this mirrors — a future-dated
    // purchase must not inflate "today" indefinitely.
    prisma.purchase.aggregate({
      where: { storeId, purchaseDate: { gte: todayStart, lt: tomorrowStart }, ...locationWhere(scope) },
      _sum: { totalAmount: true },
    }),
    prisma.purchase.aggregate({
      where: { storeId, ...locationWhere(scope) },
      _sum: { totalAmount: true },
      _count: true,
    }),
    Promise.all(
      activeMetals.map((metal) =>
        // netWeight is captured per piece (see the stock form's "Weight
        // Details" section) — a row of 4 rings at 6g each holds
        // netWeight: 6, quantity: 4, so the row's actual contribution to
        // on-hand stock is netWeight * quantity, not netWeight alone.
        // aggregate()'s _sum can't express that (it sums one raw column),
        // so this fetches the two columns and reduces client-side instead.
        prisma.inventoryStock.findMany({
          where: {
            storeId,
            metalTypeId: metal.id,
            isActive: true,
            status: { in: ON_HAND_STOCK_STATUSES },
            ...locationWhere(scope),
          },
          select: { netWeight: true, quantity: true },
        })
      )
    ),
    prisma.karigarJob.count({ where: { storeId, receivedDate: null, ...locationWhere(scope) } }),
    prisma.karigarJob.count({
      where: {
        storeId,
        receivedDate: null,
        expectedDate: { lt: now },
        ...locationWhere(scope),
      },
    }),
  ]);

  const outstanding =
    Number(outstandingAgg._sum.balanceAmount ?? 0) +
    Number(outstandingKachaAgg._sum.balanceAmount ?? 0);
  const outstandingAccounts = outstandingAgg._count + outstandingKachaAgg._count;
  const todayPurchases = Number(todayPurchasesAgg._sum.totalAmount ?? 0);
  const totalPurchases = Number(totalPurchasesAgg._sum.totalAmount ?? 0);
  const totalPurchaseCount = totalPurchasesAgg._count;

  const metalStats: MetalStockStat[] = activeMetals.map((metal, index) => ({
    metalId: metal.id,
    metalName: metal.name,
    grams: metalStockAggs[index].reduce(
      (sum, row) => sum + Number(row.netWeight ?? 0) * row.quantity,
      0
    ),
  }));

  return [
    {
      label: "Outstanding Receivables",
      value: `₹${outstanding.toLocaleString("en-IN")}`,
      change: "",
      trend: outstanding > 0 ? "down" : "up",
      sub: `across ${outstandingAccounts} account${outstandingAccounts === 1 ? "" : "s"}`,
      icon: "wallet",
      tone: "outstanding",
    },
    {
      label: "Total Vendor Purchases",
      value: `₹${totalPurchases.toLocaleString("en-IN")}`,
      change: "",
      trend: "up",
      sub: `₹${todayPurchases.toLocaleString("en-IN")} today · ${totalPurchaseCount} purchase${totalPurchaseCount === 1 ? "" : "s"}`,
      icon: "truck",
    },
    ...metalStats.map((metal) => ({
      label: `${metal.metalName} Stock`,
      value: `${metal.grams.toLocaleString("en-IN", { maximumFractionDigits: 1 })} g`,
      change: "",
      trend: "up" as const,
      sub: `${metal.metalName.toLowerCase()} on hand, excluding sold`,
      icon: "metal" as const,
    })),
    {
      label: "Pending Karigar Orders",
      value: `${pendingJobs}`,
      change: "",
      trend: overdueJobs > 0 ? "down" : "up",
      sub: `${overdueJobs} overdue`,
      icon: "hammer",
    },
  ];
}

export type SalesTrendPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

// A "use server" file can only export async functions — the display labels
// for these periods live in sales-chart.tsx instead, kept in sync with the
// bucket counts below by convention (daily=14, weekly/monthly=12, quarterly=8, yearly=5).

/** How many buckets back each period shows — enough history to read a trend
 * without the x-axis getting so dense it stops being readable. */
const SALES_TREND_BUCKET_COUNT: Record<SalesTrendPeriod, number> = {
  daily: 14,
  weekly: 12,
  monthly: 12,
  quarterly: 8,
  yearly: 5,
};

/**
 * A point on the sales trend — a week, month, quarter, or year depending on
 * the selected period.
 *
 * `sales` is the period's invoiced total; the remaining keys are one per
 * metal — Recharts needs each series as its own key on the row, so they sit
 * alongside rather than nested.
 */
export type SalesTrendPoint = {
  label: string;
  sales: number;
  [metal: string]: number | string;
};

export type SalesTrend = {
  points: SalesTrendPoint[];
  /** Metals that actually sold in the window, biggest first. */
  metals: string[];
};

type SalesTrendBucket = { key: string; label: string; start: Date };

/** The ordered list of buckets a period covers, oldest first — both the
 * chart's x-axis and the grouping key each invoice gets sorted into. */
function salesTrendBuckets(period: SalesTrendPeriod, now: Date): SalesTrendBucket[] {
  const count = SALES_TREND_BUCKET_COUNT[period];
  const buckets: SalesTrendBucket[] = [];

  for (let i = count - 1; i >= 0; i--) {
    buckets.push(salesTrendBucketFor(period, offsetPeriod(period, now, -i)));
  }

  return buckets;
}

/** Steps `date` back/forward by `amount` whole periods. */
function offsetPeriod(period: SalesTrendPeriod, date: Date, amount: number): Date {
  switch (period) {
    case "daily":
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
    case "weekly":
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount * 7);
    case "monthly":
      return new Date(date.getFullYear(), date.getMonth() + amount, 1);
    case "quarterly":
      return new Date(date.getFullYear(), date.getMonth() + amount * 3, 1);
    case "yearly":
      return new Date(date.getFullYear() + amount, 0, 1);
  }
}

/** Monday-start week, matching lib/date-range.ts's "This Week" convention. */
function startOfWeekMonday(date: Date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function salesTrendBucketFor(period: SalesTrendPeriod, date: Date): SalesTrendBucket {
  switch (period) {
    case "daily": {
      const start = startOfDay(date);
      return {
        key: start.toISOString().slice(0, 10),
        label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        start,
      };
    }
    case "weekly": {
      const start = startOfWeekMonday(date);
      return {
        key: start.toISOString().slice(0, 10),
        label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        start,
      };
    }
    case "monthly": {
      const start = startOfMonth(date);
      return {
        key: `${start.getFullYear()}-${start.getMonth()}`,
        label: start.toLocaleDateString("en-US", { month: "short" }),
        start,
      };
    }
    case "quarterly": {
      const quarter = Math.floor(date.getMonth() / 3);
      const start = new Date(date.getFullYear(), quarter * 3, 1);
      return {
        key: `${start.getFullYear()}-Q${quarter + 1}`,
        label: `Q${quarter + 1} '${String(start.getFullYear()).slice(2)}`,
        start,
      };
    }
    case "yearly": {
      const start = new Date(date.getFullYear(), 0, 1);
      return { key: `${start.getFullYear()}`, label: `${start.getFullYear()}`, start };
    }
  }
}

/** "gold" and "Gold" are the same metal to a reader; group them as one. */
function metalKey(name: string) {
  return name.trim().toLowerCase();
}

function metalLabel(name: string) {
  const trimmed = name.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Sales where no metal was recorded still have to appear somewhere. */
const UNSPECIFIED_METAL = "Unspecified";

export async function getSalesTrend(
  period: SalesTrendPeriod = "monthly"
): Promise<SalesTrend> {
  const storeId = await requireStoreScope();
  const scope = await getLocationScope();
  const now = new Date();
  const buckets = salesTrendBuckets(period, now);
  const rangeStart = buckets[0].start;

  const invoices = await prisma.invoice.findMany({
    where: {
      storeId,
      invoiceDate: { gte: rangeStart },
      status: { not: InvoiceStatus.CANCELLED },
      ...locationWhere(scope),
    },
    select: {
      invoiceDate: true,
      totalAmount: true,
      items: {
        select: {
          lineTotal: true,
          metalType: { select: { name: true } },
        },
      },
    },
  });

  const totals = new Map<string, number>();
  const perMetal = new Map<string, Map<string, number>>();
  const labels = new Map<string, string>();

  for (const bucket of buckets) {
    totals.set(bucket.key, 0);
    perMetal.set(bucket.key, new Map());
  }

  for (const invoice of invoices) {
    const key = salesTrendBucketFor(period, invoice.invoiceDate).key;
    if (!totals.has(key)) continue;

    const invoiceTotal = Number(invoice.totalAmount);
    totals.set(key, (totals.get(key) ?? 0) + invoiceTotal);

    const bucket = perMetal.get(key)!;
    const lineSum = invoice.items.reduce(
      (sum, item) => sum + Number(item.lineTotal),
      0
    );

    // Line totals exclude the invoice's discount and tax, so they do not add
    // up to what was actually charged. Scaling each line by the invoice's
    // total over its line sum spreads those proportionally across the metals,
    // which keeps the bands adding up to the same figure the total line
    // shows — a chart whose parts disagree with its whole is worse than no
    // breakdown at all.
    const factor = lineSum > 0 ? invoiceTotal / lineSum : 0;

    if (lineSum <= 0) {
      // Nothing to apportion against: book the whole invoice as unspecified
      // rather than dropping it and quietly under-reporting the month.
      bucket.set(
        UNSPECIFIED_METAL,
        (bucket.get(UNSPECIFIED_METAL) ?? 0) + invoiceTotal
      );
      labels.set(UNSPECIFIED_METAL, UNSPECIFIED_METAL);
      continue;
    }

    for (const item of invoice.items) {
      const raw = item.metalType?.name;
      const id = raw ? metalKey(raw) : UNSPECIFIED_METAL;
      if (!labels.has(id)) labels.set(id, raw ? metalLabel(raw) : UNSPECIFIED_METAL);

      bucket.set(id, (bucket.get(id) ?? 0) + Number(item.lineTotal) * factor);
    }
  }

  // Ordered by what each metal actually sold, so the biggest band sits at the
  // bottom of the stack and the legend reads in the order that matters.
  const metalTotals = new Map<string, number>();
  for (const bucket of perMetal.values()) {
    for (const [id, value] of bucket) {
      metalTotals.set(id, (metalTotals.get(id) ?? 0) + value);
    }
  }

  const metalIds = [...metalTotals.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const points: SalesTrendPoint[] = buckets.map((bucket) => {
    const metalBucket = perMetal.get(bucket.key)!;

    const point: SalesTrendPoint = {
      label: bucket.label,
      sales: totals.get(bucket.key) ?? 0,
    };

    // Every series needs a value on every row, or Recharts breaks the band
    // where a metal happened not to sell.
    for (const id of metalIds) {
      point[labels.get(id) ?? id] = Math.round((metalBucket.get(id) ?? 0) * 100) / 100;
    }

    return point;
  });

  return { points, metals: metalIds.map((id) => labels.get(id) ?? id) };
}

export type CategoryRevenue = { category: string; value: number };

export type RevenueByMetal = {
  /** The selected period's total across every metal — the figure the bars below add up to. */
  total: number;
  rows: CategoryRevenue[];
};

export type RevenueByMetalPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

/** The start of the current period — mirrors salesTrendBucketFor's per-period
 * math, but only ever needs the current bucket's start, not a whole series. */
function revenueByMetalPeriodStart(period: RevenueByMetalPeriod, now: Date): Date {
  switch (period) {
    case "daily":
      return startOfDay(now);
    case "weekly":
      return startOfWeekMonday(now);
    case "monthly":
      return startOfMonth(now);
    case "quarterly": {
      const quarter = Math.floor(now.getMonth() / 3);
      return new Date(now.getFullYear(), quarter * 3, 1);
    }
    case "yearly":
      return new Date(now.getFullYear(), 0, 1);
  }
}

/**
 * The selected period's revenue split by metal (Gold/Silver/Diamond/
 * Platinum/...), not by product taxonomy — a merchant thinks of "what did we
 * sell" in terms of metal first, and this list is never a fixed set:
 * whatever StoreMetal rows a store has configured (see Taxonomy settings)
 * show up here automatically, "Unspecified" collects line items with no
 * metal recorded at all, rather than silently dropping their revenue.
 */
export async function getRevenueByCategory(
  period: RevenueByMetalPeriod = "monthly"
): Promise<RevenueByMetal> {
  const storeId = await requireStoreScope();
  const scope = await getLocationScope();
  const now = new Date();
  const rangeStart = revenueByMetalPeriodStart(period, now);

  const items = await prisma.invoiceItem.findMany({
    where: {
      invoice: {
        storeId,
        invoiceDate: { gte: rangeStart },
        status: { not: InvoiceStatus.CANCELLED },
        ...locationWhere(scope),
      },
    },
    select: {
      lineTotal: true,
      metalType: { select: { name: true } },
    },
  });

  const byMetal = new Map<string, number>();

  for (const item of items) {
    const label = item.metalType?.name ?? "Unspecified";
    byMetal.set(label, (byMetal.get(label) ?? 0) + Number(item.lineTotal));
  }

  const rows = Array.from(byMetal.entries())
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value);

  return {
    total: rows.reduce((sum, row) => sum + row.value, 0),
    rows,
  };
}

export type DashboardTransaction = {
  id: string;
  invoiceId: string;
  customer: string;
  type: "Sale";
  metal: string;
  weight: string;
  amount: string;
  status: "Paid" | "Pending" | "Partial" | "Cancelled";
  date: string;
};

const STATUS_MAP: Record<string, "Paid" | "Pending" | "Partial" | "Cancelled"> = {
  PAID: "Paid",
  DRAFT: "Pending",
  PARTIAL: "Partial",
  CANCELLED: "Cancelled",
};

export type RecentTransactionsPeriod = "daily" | "weekly" | "monthly";

function recentTransactionsPeriodStart(period: RecentTransactionsPeriod, now: Date): Date {
  switch (period) {
    case "daily":
      return startOfDay(now);
    case "weekly":
      return startOfWeekMonday(now);
    case "monthly":
      return startOfMonth(now);
  }
}

export async function getRecentTransactions(
  period: RecentTransactionsPeriod = "daily",
  limit = 6
): Promise<DashboardTransaction[]> {
  const storeId = await requireStoreScope();
  const scope = await getLocationScope();
  const rangeStart = recentTransactionsPeriodStart(period, new Date());
  const invoices = await prisma.invoice.findMany({
    where: { storeId, invoiceDate: { gte: rangeStart }, ...locationWhere(scope) },
    orderBy: { invoiceDate: "desc" },
    take: limit,
    include: {
      customer: { select: { name: true } },
      items: {
        select: {
          metalType: { select: { name: true } },
          netWeight: true,
        },
      },
    },
  });

  return invoices.map((inv) => {
    const metals = new Set(
      inv.items.map((item) => item.metalType?.name).filter(Boolean)
    );
    const metal =
      metals.size === 0
        ? "—"
        : metals.size > 1
          ? "Mixed"
          : (metals.values().next().value as string);

    const totalWeight = inv.items.reduce(
      (sum, item) => sum + (item.netWeight ? Number(item.netWeight) : 0),
      0
    );

    return {
      id: inv.invoiceNumber,
      invoiceId: inv.id,
      customer: inv.customer.name,
      type: "Sale" as const,
      metal,
      weight: totalWeight > 0 ? `${totalWeight.toFixed(1)} g` : "—",
      amount: `₹${Number(inv.totalAmount).toLocaleString("en-IN")}`,
      status: STATUS_MAP[inv.status] ?? "Pending",
      date: inv.invoiceDate.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  });
}

export type DashboardActivity = {
  name: string;
  initials: string;
  action: string;
  detail: string;
  time: string;
};

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function relativeTime(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export async function getRecentActivity(
  limit = 5
): Promise<DashboardActivity[]> {
  const storeId = await requireStoreScope();
  const scope = await getLocationScope();
  const entries = await prisma.ledgerEntry.findMany({
    where: { storeId, ...locationWhere(scope) },
    orderBy: { entryDate: "desc" },
    take: limit,
    include: {
      customer: { select: { name: true } },
      karigar: { select: { name: true } },
      metalType: { select: { name: true } },
    },
  });

  return entries.map((entry) => {
    const name = entry.customer?.name ?? entry.karigar?.name ?? "Store";
    const isCredit = entry.type === "CREDIT";

    let action = entry.description ?? "Ledger entry recorded";
    if (entry.sourceType === "SALE") {
      action = isCredit ? "Payment received" : "Completed a purchase";
    } else if (entry.sourceType === "KARIGAR_ISSUE") {
      action = "Material issued to karigar";
    } else if (entry.sourceType === "KARIGAR_RECEIPT") {
      action = "Received goods from karigar";
    }

    const detail =
      entry.metalWeight && entry.metalType
        ? `${entry.metalType.name} · ${Number(entry.metalWeight).toFixed(1)} g`
        : `₹${Number(entry.amount).toLocaleString("en-IN")}`;

    return {
      name,
      initials: initialsOf(name),
      action,
      detail,
      time: relativeTime(entry.entryDate),
    };
  });
}
