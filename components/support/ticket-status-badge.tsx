import type { TicketStatus } from "@prisma/client"

import { Badge } from "@/components/ui/badge"

const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
}

// Sourced from Branding's five status-bucket colors (see
// lib/branding.ts/StoreBranding) — OPEN maps to Pending (awaiting a first
// response), IN_PROGRESS to Active (being worked on), RESOLVED to
// Completed, CLOSED to Inactive.
const STATUS_STYLES: Record<TicketStatus, string> = {
  OPEN: "bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]",
  IN_PROGRESS: "bg-[var(--status-active-bg)] text-[var(--status-active-text)]",
  RESOLVED: "bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]",
  CLOSED: "bg-[var(--status-inactive-bg)] text-[var(--status-inactive-text)]",
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge className={`border-transparent ${STATUS_STYLES[status]}`}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export { STATUS_LABEL as TICKET_STATUS_LABEL }
