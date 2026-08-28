"use client"

import Link from "next/link"
import { ArrowUpRight, Bell, BellOff, Mail, MessageCircle } from "lucide-react"

import type { StorePlanOverview } from "@/lib/actions/store-plan-actions"
import {
  PlanStatusPill,
  formatDay,
  formatMoney,
} from "@/components/stores/plan-presentation"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"

/**
 * The at-a-glance plan summary behind a store name.
 *
 * Everything here is a read of the subscription ledger; the full history and
 * every action live on the store's own page, which this links to. The hover
 * is for answering "where does this shop stand?" without losing the list.
 */

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium">{children}</span>
    </div>
  )
}

export function StorePlanHover({
  storeName,
  overview,
}: {
  storeName: string
  /** Absent if the ledger could not be read; the name then renders plain. */
  overview?: StorePlanOverview
}) {
  if (!overview) {
    return <span className="font-medium">{storeName}</span>
  }

  const { daysRemaining, status } = overview

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        {/* A link, not a bare span: hovering is a shortcut, but the store
            page must still be reachable by click and by keyboard — and
            focus opens the card, so this works without a pointer. */}
        <Link
          href={`/stores/${overview.storeId}`}
          className="font-medium underline-offset-4 hover:underline focus-visible:underline"
        >
          {storeName}
        </Link>
      </HoverCardTrigger>

      <HoverCardContent className="w-80">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{overview.name}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {overview.code}
            </p>
          </div>
          <PlanStatusPill status={status} />
        </div>

        <div className="divide-y">
          <div className="py-1.5">
            <Row label="Registered">{formatDay(overview.registeredAt)}</Row>
          </div>

          <div className="py-1.5">
            <Row label="Plan">{overview.planName ?? "—"}</Row>
            <Row label="Activated">{formatDay(overview.planStartedAt)}</Row>
            <Row label="Last renewed">{formatDay(overview.lastRenewedAt)}</Row>
            <Row label="Next renewal">
              {formatDay(overview.nextRenewalDue)}
              {/* Only meaningful while the plan is still running — on an
                  expired plan the count is negative and reads as nonsense. */}
              {daysRemaining !== null && daysRemaining > 0 ? (
                <span className="ml-1 font-normal text-muted-foreground">
                  ({daysRemaining}d)
                </span>
              ) : null}
            </Row>
          </div>

          <div className="py-1.5">
            <Row label="Reminder sent">
              {overview.reminderSentAt ? (
                <span className="inline-flex items-center gap-1">
                  <Bell className="size-3" />
                  {formatDay(overview.reminderSentAt)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <BellOff className="size-3" />
                  Not sent
                </span>
              )}
            </Row>

            <Row label="Reminders via">
              <span className="inline-flex items-center gap-2">
                <span
                  className={
                    overview.reminderEmailEnabled
                      ? "inline-flex items-center gap-1"
                      : "inline-flex items-center gap-1 text-muted-foreground line-through"
                  }
                >
                  <Mail className="size-3" />
                  Email
                </span>
                <span
                  className={
                    overview.reminderWhatsappEnabled
                      ? "inline-flex items-center gap-1"
                      : "inline-flex items-center gap-1 text-muted-foreground line-through"
                  }
                >
                  <MessageCircle className="size-3" />
                  WhatsApp
                </span>
              </span>
            </Row>
          </div>

          <div className="py-1.5">
            <Row label="Billed to date">{formatMoney(overview.totalBilled)}</Row>
            <Row label="Plan periods">{overview.periodsCount}</Row>
          </div>
        </div>

        <Link
          href={`/stores/${overview.storeId}`}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--chart-1)] hover:underline"
        >
          Full plan history
          <ArrowUpRight className="size-3" />
        </Link>
      </HoverCardContent>
    </HoverCard>
  )
}
