import type { PlanStatus } from "@/lib/plan-status"
import { Badge } from "@/components/ui/badge"

/**
 * Presentation shared by the plan views.
 *
 * Deliberately not a `"use client"` module. These are called from server
 * components as well as client ones, and everything exported from a client
 * module becomes a client reference — calling one of those on the server
 * throws at render rather than running the function. Keeping them here lets
 * both sides import the same helpers.
 */

const STATUS_LABEL: Record<PlanStatus, string> = {
  ACTIVE: "Active",
  EXPIRING_SOON: "Expiring soon",
  EXPIRED: "Expired",
  NO_PLAN: "No plan",
  ARCHIVED: "Archived",
}

const STATUS_CLASS: Record<PlanStatus, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  EXPIRING_SOON: "border-amber-200 bg-amber-50 text-amber-700",
  EXPIRED: "border-red-200 bg-red-50 text-red-700",
  NO_PLAN: "border-muted bg-muted text-muted-foreground",
  ARCHIVED: "border-muted bg-muted text-muted-foreground",
}

export function PlanStatusPill({ status }: { status: PlanStatus }) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export function formatDay(value: Date | string | null | undefined) {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value)
}

/** How a ledger row's action reads on screen. */
export const PLAN_ACTION_LABEL: Record<string, string> = {
  REGISTERED: "Registered",
  ASSIGNED: "Plan assigned",
  RENEWED: "Renewed",
  CHANGED: "Plan changed",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
}
