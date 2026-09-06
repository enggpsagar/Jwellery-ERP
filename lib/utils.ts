import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Capitalizes the first letter of each word — display-only formatting for
 * names that may have been typed in any case (e.g. "rohit sharma"), never
 * changes what's actually stored. */
export function toTitleCase(value: string) {
  return value
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ")
}

/** dd/MM/yy — the one date format used everywhere in this app. Accepts a
 * Date, an ISO string, or null/undefined (e.g. an optional due date), and
 * never throws on a bad value — returns "-" instead, the same placeholder
 * every other empty field in this app already uses. */
export function formatShortDate(date: Date | string | null | undefined): string {
  if (!date) return "-"
  const d = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return "-"
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

/** Same dd/MM/yy date, with a time-of-day alongside it — for timestamps
 * (a support ticket's created-at, an API key's last-used-at) where the
 * time is real information, not just the date. */
export function formatShortDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-"
  const d = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return "-"
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
  return `${formatShortDate(d)}, ${time}`
}
