"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"

/**
 * The summary-on-hover pattern from the stores list, made reusable.
 *
 * A table row shows the few columns that fit; the rest of what someone needs
 * in order to recognise a record — a phone number, a weight, what is still
 * owed — is a click away on a detail page. This puts that middle ground in
 * reach: hover the name, see the record, without losing your place in the
 * list.
 *
 * Every field comes from data the table already loaded, so opening one of
 * these costs no query. That is the constraint that keeps it usable on a
 * long list: a per-row fetch would turn one page into fifty round trips.
 */

export type HoverField = {
  label: string
  /** Rendered as-is; pass a node for badges, weights, money. */
  value: React.ReactNode
}

export type HoverSection = {
  /** Fields with a null/undefined value are dropped, not shown blank. */
  fields: HoverField[]
}

function Row({ label, value }: HoverField) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium">{value}</span>
    </div>
  )
}

export function RecordHoverCard({
  label,
  href,
  title,
  subtitle,
  badge,
  sections,
  footerLabel = "View details",
  className,
}: {
  /** What shows in the table cell. */
  label: React.ReactNode
  /** Where clicking goes; also the card's footer link. */
  href?: string
  title: string
  subtitle?: React.ReactNode
  badge?: React.ReactNode
  sections: HoverSection[]
  footerLabel?: string
  className?: string
}) {
  // Drop empty fields here rather than at every call site, so a table can
  // pass its whole field list and let the card decide what is worth showing.
  const visible = sections
    .map((section) => ({
      fields: section.fields.filter(
        (field) =>
          field.value !== null &&
          field.value !== undefined &&
          field.value !== "" &&
          field.value !== "-",
      ),
    }))
    .filter((section) => section.fields.length > 0)

  const trigger = href ? (
    // A link, so the record stays reachable by click and by keyboard —
    // focus opens the card, which makes this work without a pointer.
    <Link
      href={href}
      className={
        className ??
        "font-medium underline-offset-4 hover:underline focus-visible:underline"
      }
    >
      {label}
    </Link>
  ) : (
    <span className={className ?? "font-medium"}>{label}</span>
  )

  // Nothing extra to say: render the cell plainly rather than an empty card.
  if (visible.length === 0) return trigger

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>

      <HoverCardContent className="w-72">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground">
                {subtitle}
              </p>
            ) : null}
          </div>
          {badge ? <div className="shrink-0">{badge}</div> : null}
        </div>

        <div className="divide-y">
          {visible.map((section, index) => (
            <div key={index} className="py-1.5">
              {section.fields.map((field) => (
                <Row key={field.label} {...field} />
              ))}
            </div>
          ))}
        </div>

        {href ? (
          <Link
            href={href}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--chart-1)] hover:underline"
          >
            {footerLabel}
            <ArrowUpRight className="size-3" />
          </Link>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  )
}
