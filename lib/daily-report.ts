import { LedgerEntryType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildMultiSheetExcelExport } from "@/lib/excel-export";

/**
 * The previous day's transactions for one store: credits, debits, sales and
 * purchases, summarised in the email body and itemised in an attached
 * workbook.
 */

/**
 * India Standard Time, as a fixed offset.
 *
 * The business day this report covers is a shop's day, which ends at midnight
 * in the shop — not at midnight UTC. India has no daylight saving, so a fixed
 * +5:30 is exact rather than an approximation, and avoids depending on the
 * server's own timezone (Vercel runs in UTC).
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type DayWindow = {
  /** Inclusive UTC instant the business day starts. */
  start: Date;
  /** Exclusive UTC instant it ends. */
  end: Date;
  /** The date being reported on, e.g. "27 August 2026". */
  label: string;
  /** The same date as YYYY-MM-DD, for file names. */
  isoDate: string;
};

/**
 * The IST day before `now`, expressed as a UTC half-open range.
 *
 * Half-open on purpose: a sale booked at exactly midnight belongs to the day
 * beginning, and `lt` rather than `lte` is what stops it being counted twice
 * across two consecutive reports.
 */
export function previousIstDay(now: Date = new Date()): DayWindow {
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
  return value.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type ReportSection = {
  title: string;
  rows: Record<string, unknown>[];
  columns: string[];
  total: number;
  count: number;
};

export type DailyReport = {
  storeId: string;
  storeName: string;
  day: DayWindow;
  credit: ReportSection;
  debit: ReportSection;
  sale: ReportSection;
  purchase: ReportSection;
  /** True when nothing at all was recorded that day. */
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
  "Customer",
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
 * Gather one store's day.
 *
 * Deliberately not store-scoped through `requireStoreScope()`: this runs from
 * a cron with no session, so the store is passed in and every query filters
 * on it explicitly.
 */
export async function buildDailyReport(
  storeId: string,
  storeName: string,
  day: DayWindow,
): Promise<DailyReport> {
  const range = { gte: day.start, lt: day.end };

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
    day,
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
        Customer: row.customer?.name ?? "-",
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
export function buildDailyReportWorkbook(report: DailyReport) {
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

  const workbook = buildMultiSheetExcelExport(sheets, "daily-report");

  // The shared builder timestamps its filenames to the moment of export,
  // which is right for an ad-hoc download but wrong here: these arrive daily
  // and get filed by the day they cover, so the date in the name is the
  // business day, and two runs for the same day produce the same name.
  return {
    ...workbook,
    fileName: `daily-report-${report.day.isoDate}.xlsx`,
  };
}

export { formatMoney };
