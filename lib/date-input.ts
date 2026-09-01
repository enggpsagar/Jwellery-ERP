/**
 * Today's date as `YYYY-MM-DD`, for a date input's `min` attribute — used to
 * stop a Due Date from being backdated. Deliberately not
 * `new Date().toISOString().slice(0, 10)`: that's UTC, which reads as
 * tomorrow or yesterday depending on the browser's offset from UTC, right
 * around midnight. This reads the browser's own local date instead.
 */
export function todayForDateInput(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
