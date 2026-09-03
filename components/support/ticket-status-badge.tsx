import type { TicketStatus } from "@prisma/client"

import { Badge } from "@/components/ui/badge"

const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
}

// Matches this app's existing status-badge convention (see e.g.
// InvoiceStatus badges elsewhere): default (dark) for the state needing
// attention, outline for a settled one.
const STATUS_VARIANT: Record<TicketStatus, "default" | "secondary" | "outline"> = {
  OPEN: "default",
  IN_PROGRESS: "secondary",
  RESOLVED: "outline",
  CLOSED: "outline",
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
}

export { STATUS_LABEL as TICKET_STATUS_LABEL }
