// FILE PATH: lib/actions/dashboard-actions.ts
"use server";

import { InventoryStockStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";

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

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function formatPercent(value: number) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export type DashboardStat = {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
  sub: string;
  icon: "rupee" | "trending" | "wallet" | "metal" | "hammer";
};

export type MetalStockStat = {
  metalId: string;
  metalName: string;
  grams: number;
};

export async function getDashboardStats(): Promise<DashboardStat[]> {
  const storeId = await requireStoreScope();
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const monthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(
    new Date(now.getFullYear(), now.getMonth() - 1, 1)
  );

  const activeMetals = await prisma.storeMetal.findMany({
    where: { storeId, isActive: true },
  });

  const [
    todaySalesAgg,
    yesterdaySalesAgg,
    monthSalesAgg,
    lastMonthSalesAgg,
    outstandingAgg,
    metalStockAggs,
    pendingJobs,
    overdueJobs,
  ] = await Promise.all([
    prisma.invoice.aggregate({
      where: { storeId, invoiceDate: { gte: todayStart } },
      _sum: { totalAmount: true },
    }),
    prisma.invoice.aggregate({
      where: { storeId, invoiceDate: { gte: yesterdayStart, lt: todayStart } },
      _sum: { totalAmount: true },
    }),
    prisma.invoice.aggregate({
      where: { storeId, invoiceDate: { gte: monthStart } },
      _sum: { totalAmount: true },
    }),
    prisma.invoice.aggregate({
      where: { storeId, invoiceDate: { gte: lastMonthStart, lt: monthStart } },
      _sum: { totalAmount: true },
    }),
    prisma.invoice.aggregate({
      where: { storeId, balanceAmount: { gt: 0 } },
      _sum: { balanceAmount: true },
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
          },
          select: { netWeight: true, quantity: true },
        })
      )
    ),
    prisma.karigarJob.count({ where: { storeId, receivedDate: null } }),
    prisma.karigarJob.count({
      where: {
        storeId,
        receivedDate: null,
        expectedDate: { lt: now },
      },
    }),
  ]);

  const todaySales = Number(todaySalesAgg._sum.totalAmount ?? 0);
  const yesterdaySales = Number(yesterdaySalesAgg._sum.totalAmount ?? 0);
  const monthSales = Number(monthSalesAgg._sum.totalAmount ?? 0);
  const lastMonthSales = Number(lastMonthSalesAgg._sum.totalAmount ?? 0);
  const outstanding = Number(outstandingAgg._sum.balanceAmount ?? 0);
  const outstandingAccounts = outstandingAgg._count;

  const metalStats: MetalStockStat[] = activeMetals.map((metal, index) => ({
    metalId: metal.id,
    metalName: metal.name,
    grams: metalStockAggs[index].reduce(
      (sum, row) => sum + Number(row.netWeight ?? 0) * row.quantity,
      0
    ),
  }));

  const todayChange = percentChange(todaySales, yesterdaySales);
  const monthChange = percentChange(monthSales, lastMonthSales);

  return [
    {
      label: "Today's Sales",
      value: `₹${todaySales.toLocaleString("en-IN")}`,
      change: formatPercent(todayChange),
      trend: todayChange >= 0 ? "up" : "down",
      sub: "vs. yesterday",
      icon: "rupee",
    },
    {
      label: "Monthly Revenue",
      value: `₹${monthSales.toLocaleString("en-IN")}`,
      change: formatPercent(monthChange),
      trend: monthChange >= 0 ? "up" : "down",
      sub: "vs. last month",
      icon: "trending",
    },
    {
      label: "Outstanding Receivables",
      value: `₹${outstanding.toLocaleString("en-IN")}`,
      change: "",
      trend: outstanding > 0 ? "down" : "up",
      sub: `across ${outstandingAccounts} account${outstandingAccounts === 1 ? "" : "s"}`,
      icon: "wallet",
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

/**
 * A month on the sales trend.
 *
 * `sales` is the month's invoiced total; the remaining keys are one per metal
 * — Recharts needs each series as its own key on the row, so they sit
 * alongside rather than nested.
 */
export type MonthlySalesPoint = {
  month: string;
  sales: number;
  [metal: string]: number | string;
};

export type MonthlySalesTrend = {
  points: MonthlySalesPoint[];
  /** Metals that actually sold in the window, biggest first. */
  metals: string[];
};

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

export async function getMonthlySalesTrend(
  monthsBack = 12
): Promise<MonthlySalesTrend> {
  const storeId = await requireStoreScope();
  const now = new Date();
  const rangeStart = new Date(
    now.getFullYear(),
    now.getMonth() - (monthsBack - 1),
    1
  );

  const invoices = await prisma.invoice.findMany({
    where: { storeId, invoiceDate: { gte: rangeStart } },
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

  const monthKeys: string[] = [];
  const totals = new Map<string, number>();
  const perMetal = new Map<string, Map<string, number>>();
  const labels = new Map<string, string>();

  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    monthKeys.push(key);
    totals.set(key, 0);
    perMetal.set(key, new Map());
  }

  for (const invoice of invoices) {
    const d = invoice.invoiceDate;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
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

  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });

  const points: MonthlySalesPoint[] = monthKeys.map((key) => {
    const [year, month] = key.split("-").map(Number);
    const bucket = perMetal.get(key)!;

    const point: MonthlySalesPoint = {
      month: monthFormatter.format(new Date(year, month, 1)),
      sales: totals.get(key) ?? 0,
    };

    // Every series needs a value on every row, or Recharts breaks the band
    // where a metal happened not to sell.
    for (const id of metalIds) {
      point[labels.get(id) ?? id] = Math.round((bucket.get(id) ?? 0) * 100) / 100;
    }

    return point;
  });

  return { points, metals: metalIds.map((id) => labels.get(id) ?? id) };
}

export type CategoryRevenue = { category: string; value: number };

const CATEGORY_LABELS: Record<string, string> = {
  Ornament: "Ornaments",
  Coin: "Coins & Bars",
  Bar: "Coins & Bars",
  "Raw Metal": "Raw Metal",
  Stone: "Stones",
  Other: "Other",
};

export async function getRevenueByCategory(): Promise<CategoryRevenue[]> {
  const storeId = await requireStoreScope();
  const items = await prisma.invoiceItem.findMany({
    where: { invoice: { storeId } },
    select: {
      lineTotal: true,
      inventoryStock: {
        select: { product: { select: { category: { select: { name: true } } } } },
      },
    },
  });

  const byCategory = new Map<string, number>();

  for (const item of items) {
    const category = item.inventoryStock?.product?.category?.name ?? "Other";
    const label = CATEGORY_LABELS[category] ?? "Other";
    byCategory.set(label, (byCategory.get(label) ?? 0) + Number(item.lineTotal));
  }

  return Array.from(byCategory.entries())
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value);
}

export type DashboardTransaction = {
  id: string;
  invoiceId: string;
  customer: string;
  type: "Sale";
  metal: string;
  weight: string;
  amount: string;
  status: "Paid" | "Pending" | "Partial";
  date: string;
};

const STATUS_MAP: Record<string, "Paid" | "Pending" | "Partial"> = {
  PAID: "Paid",
  DRAFT: "Pending",
  PARTIAL: "Partial",
  CANCELLED: "Pending",
};

export async function getRecentTransactions(
  limit = 6
): Promise<DashboardTransaction[]> {
  const storeId = await requireStoreScope();
  const invoices = await prisma.invoice.findMany({
    where: { storeId },
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
  const entries = await prisma.ledgerEntry.findMany({
    where: { storeId },
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
