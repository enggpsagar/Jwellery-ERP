const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole calendar days between two dates, ignoring time-of-day — an invoice
 * raised at 11pm and checked at 1am "the next day" is 1 day old, matching
 * how a merchant or customer would describe it, not a strict 24h boundary.
 */
function daysBetweenCalendarDates(from: Date, to: Date): number {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((toUtc - fromUtc) / MS_PER_DAY);
}

export type ReturnEligibility = {
  eligible: boolean;
  /** Whole days since the invoice was raised. */
  daysElapsed: number;
  /** Days left in the window, floored at 0 once expired. */
  daysRemaining: number;
  /** The last calendar date a return may still be raised. */
  windowExpiresAt: Date;
};

/**
 * Whether an invoice raised on `invoiceDate` is still within the store's
 * configured return window as of `now` — used both to gate
 * createCreditNote server-side and to show the eligibility banner on the
 * invoice detail page, so the two never disagree.
 */
export function getReturnEligibility(
  invoiceDate: Date,
  returnWindowDays: number,
  now: Date = new Date(),
): ReturnEligibility {
  const daysElapsed = daysBetweenCalendarDates(invoiceDate, now);
  const windowExpiresAt = new Date(invoiceDate.getTime() + returnWindowDays * MS_PER_DAY);

  return {
    eligible: daysElapsed <= returnWindowDays,
    daysElapsed,
    daysRemaining: Math.max(0, returnWindowDays - daysElapsed),
    windowExpiresAt,
  };
}
