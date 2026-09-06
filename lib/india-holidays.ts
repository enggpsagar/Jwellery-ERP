/**
 * India's official gazetted public holidays, for display on the Calendar
 * View — informational only (no create/edit/delete, unlike a Reminder).
 *
 * Four are fixed every year: Republic Day, Independence Day, Gandhi
 * Jayanti (all set by law) and Christmas Day (a fixed calendar date) —
 * these recur automatically for any year requested.
 *
 * Every other festival here is lunar/lunisolar and moves every year — the
 * dates below are sourced from the DoPT (Dept. of Personnel & Training)
 * order dated 3 July 2025 for **2026 only** and are NOT valid for any
 * other year. Moon-sighting-dependent ones (Id-ul-Fitr, Id-ul-Zuha,
 * Muharram, Milad-un-Nabi) can also shift by a day from the date below
 * once officially announced closer to the time. There is no live holiday
 * API wired into this app — add the next year's entry here (from the next
 * DoPT notification, issued annually around July) before relying on this
 * for a year not listed.
 */
export type IndianHoliday = { month: number; day: number; name: string }

/** Same calendar date every year. */
export const FIXED_INDIAN_HOLIDAYS: IndianHoliday[] = [
  { month: 1, day: 26, name: "Republic Day" },
  { month: 8, day: 15, name: "Independence Day" },
  { month: 10, day: 2, name: "Gandhi Jayanti" },
  { month: 12, day: 25, name: "Christmas Day" },
]

/** Lunar/lunisolar festival dates — year-specific, see doc comment above. */
export const VARIABLE_INDIAN_HOLIDAYS_BY_YEAR: Record<number, IndianHoliday[]> = {
  2026: [
    { month: 3, day: 4, name: "Holi" },
    { month: 3, day: 21, name: "Id-ul-Fitr" },
    { month: 3, day: 26, name: "Ram Navami" },
    { month: 3, day: 31, name: "Mahavir Jayanti" },
    { month: 4, day: 3, name: "Good Friday" },
    { month: 5, day: 1, name: "Buddha Purnima" },
    { month: 5, day: 27, name: "Id-ul-Zuha (Bakrid)" },
    { month: 6, day: 26, name: "Muharram" },
    { month: 8, day: 26, name: "Milad-un-Nabi" },
    { month: 9, day: 4, name: "Janmashtami" },
    { month: 10, day: 20, name: "Dussehra" },
    { month: 11, day: 8, name: "Diwali" },
    { month: 11, day: 24, name: "Guru Nanak Jayanti" },
  ],
}

/** Every holiday falling in a given month — `month` is 1-12. */
export function getIndianHolidays(year: number, month: number): IndianHoliday[] {
  const fixed = FIXED_INDIAN_HOLIDAYS.filter((holiday) => holiday.month === month)
  const variable = (VARIABLE_INDIAN_HOLIDAYS_BY_YEAR[year] ?? []).filter(
    (holiday) => holiday.month === month,
  )
  return [...fixed, ...variable]
}
