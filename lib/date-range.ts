// lib/date-range.ts
//
// Quick date-range presets for the Reports page's date filter. Kept as a
// plain, dependency-light module (not report-actions.ts) since it's used
// from a client component too, and lib/actions files are "use server".

import { startOfDay, startOfWeek, startOfMonth, startOfYear, format } from "date-fns";

export type QuickRangeKey = "today" | "week" | "month" | "year";

export const QUICK_RANGE_OPTIONS: { key: QuickRangeKey; label: string }[] = [
  { key: "today", label: "Last Day" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
];

/** YYYY-MM-DD, the shape both the <input type="date"> and toDateRangeWhere() expect. */
function toDateInputValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

/**
 * A preset's `from` is the start of the period; `to` is always today (not
 * the period's end) — "This Year" means "1 Jan through today", not through
 * 31 Dec, since a report about the future would just be empty rows.
 */
export function getQuickRange(key: QuickRangeKey): { from: string; to: string } {
  const now = new Date();
  const to = toDateInputValue(now);

  switch (key) {
    case "today":
      return { from: toDateInputValue(startOfDay(now)), to };
    case "week":
      // Monday start — matches the financial/business-week convention the
      // rest of this app's date pickers use.
      return { from: toDateInputValue(startOfWeek(now, { weekStartsOn: 1 })), to };
    case "month":
      return { from: toDateInputValue(startOfMonth(now)), to };
    case "year":
      return { from: toDateInputValue(startOfYear(now)), to };
  }
}

/** Which preset (if any) the current from/to values exactly match — drives
 * which quick-filter button reads as active. Undefined for a custom range. */
export function matchQuickRange(from: string, to: string): QuickRangeKey | undefined {
  return QUICK_RANGE_OPTIONS.map((o) => o.key).find((key) => {
    const preset = getQuickRange(key);
    return preset.from === from && preset.to === to;
  });
}
