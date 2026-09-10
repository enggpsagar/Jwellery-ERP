import { LedgerEntryType, ReportFrequency } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildMultiSheetExcelExport } from "@/lib/excel-export";
import { formatShortDate } from "@/lib/utils";

/**
 * One store's trading activity over an arbitrary period — day, month,
 * quarter or year — summarised in the email body and itemised in an
 * attached workbook. Generalized from what was originally a daily-only
 * report (see git history: lib/daily-report.ts) once Reports & Notifications
 * settings added Monthly/Quarterly/Annual cadence — none of the aggregation
 * queries below were ever day-specific, only the window passed in was.
 */

/**
 * India Standard Time, as a fixed offset.
 *
 * The business period this report covers is a shop's day/month/quarter/year,
 * which ends at midnight in the shop — not at midnight UTC. India has no
 * daylight saving, so a fixed +5:30 is exact rather than an approximation,
 * and avoids depending on the server's own timezone (Vercel runs in UTC).
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type ReportWindow = {
  /** Inclusive UTC instant the period starts. */
  start: Date;
  /** Exclusive UTC instant it ends. */
  end: Date;
  /** The period being reported on, e.g. "27 August 2026", "August 2026", "Q3 2026", "2026". */
  label: string;
  /** A filename-safe identifier for the period, e.g. "2026-08-27", "2026-08", "2026-Q3", "2026". */
  isoDate: string;
};

/**
 * The IST day before `now`, expressed as a UTC half-open range.
 *
 * Half-open on purpose: a sale booked at exactly midnight belongs to the day
 * beginning, and `lt` rather than `lte` is what stops it being counted twice
 * across two consecutive reports.
 */
export function previousIstDay(now: Date = new Date()): ReportWindow {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);

  // Read the shifted instant with UTC getters: they now describe IST wall
  // clock, whereas the local getters would re-apply the server's own zone.
  const startOfTodayIst = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate(),
  );

  const startOfYesterdayIst = startOfTodayIst - 24 * 60 * 60 * 1000;

  const start = new Date(startOfYesterdayIst - IST_OFFSET_MS);
  const end = new Date(startOfTodayIst - IST_OFFSET_MS);

  return {
    start,
    end,
    label: new Date(startOfYesterdayIst).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    // Taken from the IST-shifted instant, not from `start` — `start` is the
    // UTC moment the day opens (18:30 the previous date), so naming the file
    // after it would date every report to the day before the one it covers.
    isoDate: new Date(startOfYesterdayIst).toISOString().slice(0, 10),
  };
}

/** The last fully completed IST calendar month before `now`. */
export function previousIstMonth(now: Date = new Date()): ReportWindow {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();

  const startOfThisMonthIst = Date.UTC(year, month, 1);
  const startOfPrevMonthIst = Date.UTC(year, month - 1, 1);

  const start = new Date(startOfPrevMonthIst - IST_OFFSET_MS);
  const end = new Date(startOfThisMonthIst - IST_OFFSET_MS);
  const prevMonthDate = new Date(startOfPrevMonthIst);

  return {
    start,
    end,
    label: prevMonthDate.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    isoDate: prevMonthDate.toISOString().slice(0, 7),
  };
}

/** The last fully completed IST calendar quarter (Jan-Mar/Apr-Jun/Jul-Sep/Oct-Dec) before `now`. */
export function previousIstQuarter(now: Date = new Date()): ReportWindow {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const year = istNow.getUTCFullYear();
  const currentQuarterStartMonth = Math.floor(istNow.getUTCMonth() / 3) * 3;

  const startOfThisQuarterIst = Date.UTC(year, currentQuarterStartMonth, 1);
  const startOfPrevQuarterIst = Date.UTC(year, currentQuarterStartMonth - 3, 1);

  const start = new Date(startOfPrevQuarterIst - IST_OFFSET_MS);
  const end = new Date(startOfThisQuarterIst - IST_OFFSET_MS);

  const prevQuarterDate = new Date(startOfPrevQuarterIst);
  const prevQuarterNumber = Math.floor(prevQuarterDate.getUTCMonth() / 3) + 1;
  const prevQuarterYear = prevQuarterDate.getUTCFullYear();

  return {
    start,
    end,
    label: `Q${prevQuarterNumber} ${prevQuarterYear}`,
    isoDate: `${prevQuarterYear}-Q${prevQuarterNumber}`,
  };
}

/** The last fully completed IST calendar year before `now`. */
export function previousIstYear(now: Date = new Date()): ReportWindow {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const year = istNow.getUTCFullYear();

  const startOfThisYearIst = Date.UTC(year, 0, 1);
  const startOfPrevYearIst = Date.UTC(year - 1, 0, 1);

  const start = new Date(startOfPrevYearIst - IST_OFFSET_MS);
  const end = new Date(startOfThisYearIst - IST_OFFSET_MS);

  return {
    start,
    end,
    label: String(year - 1),
    isoDate: String(year - 1),
  };
}

/**
 * Which window a store on this frequency is due to be sent right now, given
 * IST-`now` — or `null` if today isn't that frequency's due day. DAILY is
 * always due (the cron itself only runs once a day); MONTHLY/QUARTERLY/
 * ANNUAL are due only on the 1st of their respective period, mirroring how
 * a calendar month/quarter/year is only just complete on that day.
 *
 * Not used by `generateAndSendReportNow` (a manual click is due by
 * definition) — only by the scheduled cron, which needs to decide this for
 * every active store on every run.
 */
export function dueWindowForFrequency(
  frequency: ReportFrequency,
  now: Date = new Date(),
): ReportWindow | null {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const dayOfMonth = istNow.getUTCDate();
  const month = istNow.getUTCMonth();

  switch (frequency) {
    case ReportFrequency.DAILY:
      return previousIstDay(now);
    case ReportFrequency.MONTHLY:
      return dayOfMonth === 1 ? previousIstMonth(now) : null;
    case ReportFrequency.QUARTERLY:
      return dayOfMonth === 1 && month % 3 === 0 ? previousIstQuarter(now) : null;
    case ReportFrequency.ANNUAL:
      return dayOfMonth === 1 && month === 0 ? previousIstYear(now) : null;
    default:
      return null;
  }
}

/** The window to use for a manual "Generate & Email Now" click — the most
 *  recently completed period for the store's configured frequency, same as
 *  what the schedule would have sent had today been its due day. */
export function currentWindowForFrequency(
  frequency: ReportFrequency,
  now: Date = new Date(),
): ReportWindow {
  switch (frequency) {
    case ReportFrequency.DAILY:
      return previousIstDay(now);
    case ReportFrequency.MONTHLY:
      return previousIstMonth(now);
    case ReportFrequency.QUARTERLY:
      return previousIstQuarter(now);
    case ReportFrequency.ANNUAL:
      return previousIstYear(now);
  }
}

export const FREQUENCY_LABELS: Record<ReportFrequency, string> = {
  [ReportFrequency.DAILY]: "Daily",
  [ReportFrequency.MONTHLY]: "Monthly",
  [ReportFrequency.QUARTERLY]: "Quarterly",
  [ReportFrequency.ANNUAL]: "Annual",
};

/** Every frequency, in the fixed display order used across the settings
 *  form and email/report content. */
export const ALL_FREQUENCIES: ReportFrequency[] = [
  ReportFrequency.DAILY,
  ReportFrequency.MONTHLY,
  ReportFrequency.QUARTERLY,
  ReportFrequency.ANNUAL,
];

export type LastSentField =
  | "dailyLastSentAt"
  | "monthlyLastSentAt"
  | "quarterlyLastSentAt"
  | "annualLastSentAt";

/** Which ReportSettings column gates double-sending for a given frequency —
 *  each of Daily/Monthly/Quarterly/Annual has its own, since a store can
 *  have several enabled at once and sending one must not mark another as
 *  already sent. */
export const LAST_SENT_FIELD: Record<ReportFrequency, LastSentField> = {
  [ReportFrequency.DAILY]: "dailyLastSentAt",
  [ReportFrequency.MONTHLY]: "monthlyLastSentAt",
  [ReportFrequency.QUARTERLY]: "quarterlyLastSentAt",
  [ReportFrequency.ANNUAL]: "annualLastSentAt",
};

function money(value: unknown) {
  return Number(value ?? 0);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTime(value: Date) {
  return formatShortDate(value);
}

export type ReportSection = {
  title: string;
  rows: Record<string, unknown>[];
  columns: string[];
  total: number;
  count: number;
};

export type PeriodReport = {
  storeId: string;
  storeName: string;
  period: ReportWindow;
  credit: ReportSection;
  debit: ReportSection;
  sale: ReportSection;
  purchase: ReportSection;
  /** True when nothing at all was recorded in the period. */
  isEmpty: boolean;
};

/** Column order for each sheet, also used to write headers for empty sheets. */
const LEDGER_COLUMNS = [
  "Sr. No.",
  "Date",
  "Party",
  "Type",
  "Source",
  "Payment Method",
  "Reference",
  "Description",
  "Amount",
];

const SALE_COLUMNS = [
  "Sr. No.",
  "Date",
  "Invoice No.",
  "Party",
  "Status",
  "Items",
  "Subtotal",
  "Making",
  "Stone",
  "Discount",
  "Tax",
  "Paid",
  "Balance",
  "Total",
];

const PURCHASE_COLUMNS = [
  "Sr. No.",
  "Date",
  "Purchase No.",
  "Vendor",
  "Status",
  "Items",
  "Subtotal",
  "Making",
  "Stone",
  "Discount",
  "Tax",
  "Paid",
  "Balance",
  "Total",
];

/**
 * Which party a ledger row concerns. An entry names at most one of these, so
 * the first that is set is the answer.
 */
function ledgerParty(entry: {
  customer: { name: string } | null;
  vendor: { name: string } | null;
  karigar: { name: string } | null;
}) {
  return entry.customer?.name ?? entry.vendor?.name ?? entry.karigar?.name ?? "-";
}

/**
 * Gather one store's activity over `period`.
 *
 * Deliberately not store-scoped through `requireStoreScope()`: this runs
 * from a cron with no session, so the store is passed in and every query
 * filters on it explicitly. The manual "Generate & Email Now" action
 * resolves storeId via requireStoreScope() itself before calling this.
 */
export async function buildPeriodReport(
  storeId: string,
  storeName: string,
  period: ReportWindow,
): Promise<PeriodReport> {
  const range = { gte: period.start, lt: period.end };

  const [ledgerEntries, invoices, purchases] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { storeId, entryDate: range },
      orderBy: { entryDate: "asc" },
      select: {
        entryDate: true,
        type: true,
        sourceType: true,
        amount: true,
        paymentMethod: true,
        paymentReference: true,
        description: true,
        customer: { select: { name: true } },
        vendor: { select: { name: true } },
        karigar: { select: { name: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { storeId, invoiceDate: range },
      orderBy: { invoiceDate: "asc" },
      select: {
        invoiceNumber: true,
        invoiceDate: true,
        status: true,
        subtotal: true,
        makingCharges: true,
        stoneCharges: true,
        discount: true,
        taxAmount: true,
        totalAmount: true,
        paidAmount: true,
        balanceAmount: true,
        customer: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.purchase.findMany({
      where: { storeId, purchaseDate: range },
      orderBy: { purchaseDate: "asc" },
      select: {
        purchaseNumber: true,
        purchaseDate: true,
        status: true,
        subtotal: true,
        makingCharges: true,
        stoneCharges: true,
        discount: true,
        taxAmount: true,
        totalAmount: true,
        paidAmount: true,
        balanceAmount: true,
        vendor: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  const ledgerSection = (type: LedgerEntryType, title: string): ReportSection => {
    const entries = ledgerEntries.filter((entry) => entry.type === type);

    return {
      title,
      columns: LEDGER_COLUMNS,
      count: entries.length,
      total: entries.reduce((sum, entry) => sum + money(entry.amount), 0),
      rows: entries.map((entry, index) => ({
        "Sr. No.": index + 1,
        Date: formatTime(entry.entryDate),
        Party: ledgerParty(entry),
        Type: entry.type,
        Source: String(entry.sourceType).replaceAll("_", " "),
        "Payment Method": entry.paymentMethod
          ? String(entry.paymentMethod).replaceAll("_", " ")
          : "-",
        Reference: entry.paymentReference ?? "-",
        Description: entry.description ?? "-",
        Amount: money(entry.amount),
      })),
    };
  };

  return {
    storeId,
    storeName,
    period,
    credit: ledgerSection(LedgerEntryType.CREDIT, "Credit"),
    debit: ledgerSection(LedgerEntryType.DEBIT, "Debit"),
    sale: {
      title: "Sale",
      columns: SALE_COLUMNS,
      count: invoices.length,
      total: invoices.reduce((sum, row) => sum + money(row.totalAmount), 0),
      rows: invoices.map((row, index) => ({
        "Sr. No.": index + 1,
        Date: formatTime(row.invoiceDate),
        "Invoice No.": row.invoiceNumber,
        Party: row.customer?.name ?? "-",
        Status: row.status,
        Items: row._count.items,
        Subtotal: money(row.subtotal),
        Making: money(row.makingCharges),
        Stone: money(row.stoneCharges),
        Discount: money(row.discount),
        Tax: money(row.taxAmount),
        Paid: money(row.paidAmount),
        Balance: money(row.balanceAmount),
        Total: money(row.totalAmount),
      })),
    },
    purchase: {
      title: "Purchase",
      columns: PURCHASE_COLUMNS,
      count: purchases.length,
      total: purchases.reduce((sum, row) => sum + money(row.totalAmount), 0),
      rows: purchases.map((row, index) => ({
        "Sr. No.": index + 1,
        Date: formatTime(row.purchaseDate),
        "Purchase No.": row.purchaseNumber,
        Vendor: row.vendor?.name ?? "-",
        Status: row.status,
        Items: row._count.items,
        Subtotal: money(row.subtotal),
        Making: money(row.makingCharges),
        Stone: money(row.stoneCharges),
        Discount: money(row.discount),
        Tax: money(row.taxAmount),
        Paid: money(row.paidAmount),
        Balance: money(row.balanceAmount),
        Total: money(row.totalAmount),
      })),
    },
    isEmpty:
      ledgerEntries.length === 0 &&
      invoices.length === 0 &&
      purchases.length === 0,
  };
}

/**
 * The attached workbook: one sheet per category, each ending in a totals row.
 *
 * The total is written into the sheet rather than left for the reader to sum,
 * so the figure in the email and the figure in the file are the same number
 * and cannot disagree.
 */
export function buildPeriodReportWorkbook(report: PeriodReport, frequency: ReportFrequency) {
  const sections = [report.credit, report.debit, report.sale, report.purchase];

  const sheets = sections.map((section) => {
    const amountColumn =
      section.title === "Credit" || section.title === "Debit" ? "Amount" : "Total";

    // Blank row first so the total never reads as one more transaction.
    const rows = section.rows.length
      ? [
          ...section.rows,
          Object.fromEntries(section.columns.map((column) => [column, ""])),
          {
            ...Object.fromEntries(section.columns.map((column) => [column, ""])),
            "Sr. No.": "TOTAL",
            [amountColumn]: section.total,
          },
        ]
      : [];

    return { name: section.title, rows, columns: section.columns };
  });

  const workbook = buildMultiSheetExcelExport(sheets, "report");

  // The shared builder timestamps its filenames to the moment of export,
  // which is right for an ad-hoc download but wrong here: these arrive on a
  // schedule and get filed by the period they cover, so the date in the name
  // is the business period, and two runs for the same period produce the
  // same name.
  return {
    ...workbook,
    fileName: `report-${frequency.toLowerCase()}-${report.period.isoDate}.xlsx`,
  };
}

export { formatMoney };
