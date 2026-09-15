// FILE PATH: lib/actions/dashboard-actions.ts
"use server";

import { InventoryStockStatus, InvoiceStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope, getStoreIdForRead } from "@/lib/store-context";
import { getLocationScope, locationWhere } from "@/lib/location-scope";
import { formatShortDateTime } from "@/lib/utils";

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

// India Standard Time, as a fixed offset — no daylight saving in India, so
// +5:30 is exact rather than an approximation. Every "today"/"this week"/
// "this month"/"this quarter"/"this year" boundary and chart bucket in this
// file describes the shop's own calendar, which turns over at midnight IST —
// not midnight wherever the server happens to run (Vercel: UTC). Every date
// helper below used to read `date.getFullYear()`/`getMonth()`/`getDate()`/
// `getHours()`/`getDay()` (the LOCAL getters) and construct with
// `new Date(y, m, d)` (also local-timezone), correct by accident on a dev
// machine already set to IST but wrong in production: it silently used UTC
// boundaries instead, misattributing the first ~5.5 hours of every IST day/
// week/month/quarter/year to the *previous* bucket, and shifting every
// hourly sales-trend point by a fixed 5.5 hours all day, every day. Same
// reasoning as lib/report-builder.ts's own IST_OFFSET_MS and
// lib/actions/ledger-actions.ts's startOfIstDay.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Shifts a real instant so its UTC getters (getUTCFullYear, getUTCMonth,
 *  getUTCDate, getUTCDay, getUTCHours) read as IST wall-clock components —
 *  never read a plain Date's own local getters below, or the server's own
 *  timezone dependence creeps back in. */
function toIst(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

/** Reverses toIst: turns a `Date.UTC(...)` value built from IST-shifted
 *  components back into the real instant to store/compare/query by. */
function fromIstUtcMs(istUtcMs: number): Date {
  return new Date(istUtcMs - IST_OFFSET_MS);
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfDay(date: Date): Date {
  const ist = toIst(date);
  return fromIstUtcMs(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

function startOfMonth(date: Date): Date {
  const ist = toIst(date);
  return fromIstUtcMs(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1));
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
  /** Only set when icon is "metal" — lets the card pick a gold/silver/diamond-specific icon and color instead of one generic "metal" look for every configured metal. */
  metalName?: string;
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

  // IST has no daylight saving, so a plain +24h is exact — no need for a
  // calendar-aware setDate() (which reads/writes the server's own local
  // timezone) now that todayStart is itself already an IST-correct instant.
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);

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

  // Only metals actually on hand get their own KPI card — a store's
  // configured Taxonomy can list metals it doesn't currently stock (or
  // hasn't yet), and a "Diamond Stock: 0.0 g" card for one never on hand
  // is clutter, not information (same reasoning as the Customer Ledger's
  // per-metal cards).
  const metalStats: MetalStockStat[] = activeMetals
    .map((metal, index) => ({
      metalId: metal.id,
      metalName: metal.name,
      grams: metalStockAggs[index].reduce(
        (sum, row) => sum + Number(row.netWeight ?? 0) * row.quantity,
        0
      ),
    }))
    .filter((metal) => metal.grams > 0);

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
      metalName: metal.metalName,
    })),
    {
      label: "Pending Artisan Orders",
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
    // Daily/weekly are fixed-length in IST (no DST), so plain ms arithmetic
    // on the already-IST-correct instant is exact and needs no shift.
    case "daily":
      return new Date(date.getTime() + amount * 86_400_000);
    case "weekly":
      return new Date(date.getTime() + amount * 7 * 86_400_000);
    case "monthly": {
      const ist = toIst(date);
      return fromIstUtcMs(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + amount, 1));
    }
    case "quarterly": {
      const ist = toIst(date);
      return fromIstUtcMs(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + amount * 3, 1));
    }
    case "yearly": {
      const ist = toIst(date);
      return fromIstUtcMs(Date.UTC(ist.getUTCFullYear() + amount, 0, 1));
    }
  }
}

/** Monday-start week, matching lib/date-range.ts's "This Week" convention. */
function startOfWeekMonday(date: Date): Date {
  const d = startOfDay(date);
  const day = toIst(d).getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  return new Date(d.getTime() - diff * 86_400_000);
}

function salesTrendBucketFor(period: SalesTrendPeriod, date: Date): SalesTrendBucket {
  switch (period) {
    case "daily": {
      const start = startOfDay(date);
      const ist = toIst(start);
      return {
        key: `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`,
        label: `${MONTH_ABBR[ist.getUTCMonth()]} ${ist.getUTCDate()}`,
        start,
      };
    }
    case "weekly": {
      const start = startOfWeekMonday(date);
      const ist = toIst(start);
      return {
        key: `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`,
        label: `${MONTH_ABBR[ist.getUTCMonth()]} ${ist.getUTCDate()}`,
        start,
      };
    }
    case "monthly": {
      const start = startOfMonth(date);
      const ist = toIst(start);
      return {
        key: `${ist.getUTCFullYear()}-${ist.getUTCMonth()}`,
        label: MONTH_ABBR[ist.getUTCMonth()],
        start,
      };
    }
    case "quarterly": {
      const dateIst = toIst(date);
      const quarter = Math.floor(dateIst.getUTCMonth() / 3);
      const start = fromIstUtcMs(Date.UTC(dateIst.getUTCFullYear(), quarter * 3, 1));
      const startYear = toIst(start).getUTCFullYear();
      return {
        key: `${startYear}-Q${quarter + 1}`,
        label: `Q${quarter + 1} '${String(startYear).slice(2)}`,
        start,
      };
    }
    case "yearly": {
      const dateIst = toIst(date);
      const start = fromIstUtcMs(Date.UTC(dateIst.getUTCFullYear(), 0, 1));
      const startYear = toIst(start).getUTCFullYear();
      return { key: `${startYear}`, label: `${startYear}`, start };
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
  const storeId = await getStoreIdForRead();
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

/**
 * Drills into the CURRENT period only, one level finer than the period
 * itself — Daily shows today's 24 hours, Weekly shows this week's 7 days,
 * Monthly shows this month's days, Quarterly shows this quarter's 3 months,
 * Yearly shows this year's 12 months. Unlike getSalesTrend (which shows N
 * trailing whole periods, each bucket the same size as the period), this is
 * for the compact Sales card's own chart, which needs to answer "where
 * inside today/this week/etc. did the sales happen," not "how did this
 * period compare to recent ones."
 *
 * `currentTotal`/`previousTotal` are the current vs. immediately-prior
 * period's totals (today vs yesterday, this week vs last week, ...) — the
 * same comparison SalesSummaryCard's badge always showed, computed directly
 * here rather than derived from getSalesTrend's own bucket list.
 */
export type SalesBreakdown = SalesTrend & {
  currentTotal: number;
  previousTotal: number;
};

function startOfPeriod(period: SalesTrendPeriod, date: Date): Date {
  switch (period) {
    case "daily":
      return startOfDay(date);
    case "weekly":
      return startOfWeekMonday(date);
    case "monthly":
      return startOfMonth(date);
    case "quarterly": {
      const ist = toIst(date);
      const quarter = Math.floor(ist.getUTCMonth() / 3);
      return fromIstUtcMs(Date.UTC(ist.getUTCFullYear(), quarter * 3, 1));
    }
    case "yearly": {
      const ist = toIst(date);
      return fromIstUtcMs(Date.UTC(ist.getUTCFullYear(), 0, 1));
    }
  }
}

type SubBucket = { key: string; label: string; start: Date };

/** The sub-buckets the current period is drilled into, oldest first. */
function subBucketsFor(period: SalesTrendPeriod, periodStart: Date): SubBucket[] {
  switch (period) {
    case "daily": {
      // periodStart is already the correct IST-midnight instant — adding
      // whole hours of real elapsed time lands each sub-bucket at the right
      // moment regardless of server timezone (no DST in IST to worry about).
      const buckets: SubBucket[] = [];
      for (let h = 0; h < 24; h++) {
        const start = new Date(periodStart.getTime() + h * 3_600_000);
        const suffix = h < 12 ? "AM" : "PM";
        const displayHour = h % 12 === 0 ? 12 : h % 12;
        buckets.push({ key: `h${h}`, label: `${displayHour}${suffix}`, start });
      }
      return buckets;
    }
    case "weekly": {
      const buckets: SubBucket[] = [];
      for (let d = 0; d < 7; d++) {
        const start = new Date(periodStart.getTime() + d * 86_400_000);
        buckets.push({
          key: `d${d}`,
          label: WEEKDAY_ABBR[toIst(start).getUTCDay()],
          start,
        });
      }
      return buckets;
    }
    case "monthly": {
      const ist = toIst(periodStart);
      // Day 0 of next month == the last day of this one — a standard trick,
      // done here via Date.UTC so it isn't itself server-timezone-dependent.
      const daysInMonth = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, 0)).getUTCDate();
      const buckets: SubBucket[] = [];
      for (let d = 0; d < daysInMonth; d++) {
        const start = fromIstUtcMs(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), d + 1));
        buckets.push({ key: `d${d}`, label: `${d + 1}`, start });
      }
      return buckets;
    }
    case "quarterly": {
      const ist = toIst(periodStart);
      const buckets: SubBucket[] = [];
      for (let m = 0; m < 3; m++) {
        const start = fromIstUtcMs(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + m, 1));
        buckets.push({
          key: `m${m}`,
          label: MONTH_ABBR[toIst(start).getUTCMonth()],
          start,
        });
      }
      return buckets;
    }
    case "yearly": {
      const ist = toIst(periodStart);
      const buckets: SubBucket[] = [];
      for (let m = 0; m < 12; m++) {
        const start = fromIstUtcMs(Date.UTC(ist.getUTCFullYear(), m, 1));
        buckets.push({
          key: `m${m}`,
          label: MONTH_ABBR[m],
          start,
        });
      }
      return buckets;
    }
  }
}

/** Which sub-bucket an invoiceDate inside the current period falls into —
 * matched by index rather than re-deriving a key, since every sub-bucket
 * scheme above is evenly spaced within the period. */
function subBucketIndexFor(period: SalesTrendPeriod, periodStart: Date, date: Date): number {
  switch (period) {
    case "daily":
      return toIst(date).getUTCHours();
    case "weekly":
      return Math.floor((startOfDay(date).getTime() - periodStart.getTime()) / 86_400_000);
    case "monthly":
      return toIst(date).getUTCDate() - 1;
    case "quarterly":
      return toIst(date).getUTCMonth() - toIst(periodStart).getUTCMonth();
    case "yearly":
      return toIst(date).getUTCMonth();
  }
}

export async function getSalesBreakdown(
  period: SalesTrendPeriod = "daily"
): Promise<SalesBreakdown> {
  const storeId = await getStoreIdForRead();
  const scope = await getLocationScope();
  const now = new Date();

  const currentStart = startOfPeriod(period, now);
  const currentEnd = offsetPeriod(period, currentStart, 1);
  const previousStart = offsetPeriod(period, currentStart, -1);

  const buckets = subBucketsFor(period, currentStart);

  const invoices = await prisma.invoice.findMany({
    where: {
      storeId,
      invoiceDate: { gte: previousStart, lt: currentEnd },
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

  let currentTotal = 0;
  let previousTotal = 0;

  for (const invoice of invoices) {
    const invoiceTotal = Number(invoice.totalAmount);

    if (invoice.invoiceDate < currentStart) {
      previousTotal += invoiceTotal;
      continue;
    }

    currentTotal += invoiceTotal;

    const index = subBucketIndexFor(period, currentStart, invoice.invoiceDate);
    const bucket = buckets[index];
    if (!bucket) continue;

    totals.set(bucket.key, (totals.get(bucket.key) ?? 0) + invoiceTotal);

    const metalBucket = perMetal.get(bucket.key)!;
    const lineSum = invoice.items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
    const factor = lineSum > 0 ? invoiceTotal / lineSum : 0;

    if (lineSum <= 0) {
      metalBucket.set(UNSPECIFIED_METAL, (metalBucket.get(UNSPECIFIED_METAL) ?? 0) + invoiceTotal);
      labels.set(UNSPECIFIED_METAL, UNSPECIFIED_METAL);
      continue;
    }

    for (const item of invoice.items) {
      const raw = item.metalType?.name;
      const id = raw ? metalKey(raw) : UNSPECIFIED_METAL;
      if (!labels.has(id)) labels.set(id, raw ? metalLabel(raw) : UNSPECIFIED_METAL);

      metalBucket.set(id, (metalBucket.get(id) ?? 0) + Number(item.lineTotal) * factor);
    }
  }

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

    for (const id of metalIds) {
      point[labels.get(id) ?? id] = Math.round((metalBucket.get(id) ?? 0) * 100) / 100;
    }

    return point;
  });

  return {
    points,
    metals: metalIds.map((id) => labels.get(id) ?? id),
    currentTotal,
    previousTotal,
  };
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
      const ist = toIst(now);
      const quarter = Math.floor(ist.getUTCMonth() / 3);
      return fromIstUtcMs(Date.UTC(ist.getUTCFullYear(), quarter * 3, 1));
    }
    case "yearly": {
      const ist = toIst(now);
      return fromIstUtcMs(Date.UTC(ist.getUTCFullYear(), 0, 1));
    }
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
  const storeId = await getStoreIdForRead();
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
  const storeId = await getStoreIdForRead();
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
      date: formatShortDateTime(inv.invoiceDate),
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
      // Was missing entirely — every vendor-side entry (a Purchase's own
      // balance-due accrual, a Payment Out) had neither customer nor
      // karigar set, so it fell all the way through to the generic "Store"
      // fallback below regardless of which vendor it was actually about.
      vendor: { select: { name: true } },
      karigar: { select: { name: true } },
      metalType: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });

  return entries.map((entry) => {
    const name = entry.customer?.name ?? entry.vendor?.name ?? entry.karigar?.name ?? "Store";
    const isCredit = entry.type === "CREDIT";

    let action = entry.description ?? "Ledger entry recorded";
    if (entry.sourceType === "SALE") {
      action = isCredit ? "Payment received" : "Completed a purchase";
    } else if (entry.sourceType === "PURCHASE") {
      // Purchase's own balance-due accrual entry — distinct from an actual
      // payment (PAYMENT_OUT below), same convention the SALE branch above
      // already draws for its Invoice-side equivalent.
      action = "Recorded a purchase";
    } else if (entry.sourceType === "PAYMENT_IN") {
      action = "Payment received";
    } else if (entry.sourceType === "PAYMENT_OUT") {
      action = "Payment made";
    } else if (entry.sourceType === "SALE_RETURN") {
      action = "Processed a return";
    } else if (entry.sourceType === "ADJUSTMENT") {
      action = "Balance adjusted";
    } else if (entry.sourceType === "KARIGAR_ISSUE") {
      action = "Material issued to artisan";
    } else if (entry.sourceType === "KARIGAR_RECEIPT") {
      action = "Received goods from artisan";
    }

    const amountOrWeight =
      entry.metalWeight && entry.metalType
        ? `${entry.metalType.name} · ${Number(entry.metalWeight).toFixed(1)} g`
        : `₹${Number(entry.amount).toLocaleString("en-IN")}`;
    // "by <staff name>" answers who actually recorded this — createdBy is
    // nullable (entries written before that column existed have none), so
    // this quietly drops rather than showing "by null" for those.
    const detail = entry.createdBy?.name
      ? `${amountOrWeight} · by ${entry.createdBy.name}`
      : amountOrWeight;

    return {
      name,
      initials: initialsOf(name),
      action,
      detail,
      time: relativeTime(entry.entryDate),
    };
  });
}
