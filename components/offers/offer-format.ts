// Display helpers for the Offers & Vouchers screens. Dates are shown as IST
// calendar days on purpose (the actions store validFrom / validUntil /
// expiresAt as the start / end of an IST day) — and formatting from a fixed
// offset keeps the server render and the browser render identical.

import type { PromotionRow } from "@/lib/actions/promotion-actions"

const IST_OFFSET_MS = 330 * 60 * 1000

/** ISO timestamp → "YYYY-MM-DD" of its IST calendar day (for <input type="date">). */
export function istDateInput(iso: string | null | undefined) {
  if (!iso) return ""
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ""
  return new Date(time + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** ISO timestamp → "DD/MM/YY" (IST), the app's short date format. */
export function istShortDate(iso: string | null | undefined) {
  const day = istDateInput(iso)
  if (!day) return "-"
  const [y, m, d] = day.split("-")
  return `${d}/${m}/${y.slice(-2)}`
}

/** Today's IST date as "YYYY-MM-DD" (min for date inputs). */
export function istToday() {
  return istDateInput(new Date().toISOString())
}

export const rupees = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

export type OfferStatus = "running" | "paused" | "scheduled" | "ended" | "exhausted"

export function offerStatus(offer: PromotionRow, now = Date.now()): OfferStatus {
  if (!offer.isActive) return "paused"
  if (offer.validUntil && new Date(offer.validUntil).getTime() < now) return "ended"
  if (offer.validFrom && new Date(offer.validFrom).getTime() > now) return "scheduled"
  if (offer.usageLimit != null && offer.redemptions >= offer.usageLimit) return "exhausted"
  return "running"
}

export const STATUS_LABEL: Record<OfferStatus, string> = {
  running: "Running",
  paused: "Paused",
  scheduled: "Scheduled",
  ended: "Ended",
  exhausted: "Fully redeemed",
}

export const STATUS_CLASS: Record<OfferStatus, string> = {
  running: "border-emerald-200 bg-emerald-50 text-emerald-700",
  paused: "border-zinc-200 bg-zinc-50 text-zinc-600",
  scheduled: "border-sky-200 bg-sky-50 text-sky-700",
  ended: "border-red-200 bg-red-50 text-red-700",
  exhausted: "border-amber-200 bg-amber-50 text-amber-700",
}

export function validityLabel(offer: Pick<PromotionRow, "validFrom" | "validUntil">) {
  if (offer.validFrom && offer.validUntil) {
    return `${istShortDate(offer.validFrom)} – ${istShortDate(offer.validUntil)}`
  }
  if (offer.validFrom) return `From ${istShortDate(offer.validFrom)}`
  if (offer.validUntil) return `Until ${istShortDate(offer.validUntil)}`
  return "No end date"
}

export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}
