import type { Metadata } from "next"
import Link from "next/link"
import { TicketStatus } from "@prisma/client"

import { getAllSupportTickets } from "@/lib/actions/support-ticket-actions"
import { TicketStatusBadge } from "@/components/support/ticket-status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Support Tickets",
}

export const dynamic = "force-dynamic"

const STATUS_FILTERS: { label: string; value: TicketStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Open", value: TicketStatus.OPEN },
  { label: "In Progress", value: TicketStatus.IN_PROGRESS },
  { label: "Resolved", value: TicketStatus.RESOLVED },
  { label: "Closed", value: TicketStatus.CLOSED },
]

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso))
}

type SupportTicketsPageProps = {
  searchParams?: Promise<{ status?: string }>
}

/**
 * SUPER_ADMIN's support inbox — every ticket across every store, since this
 * is platform support rather than a per-store record (see SupportTicket's
 * own doc comment in prisma/schema.prisma). Gated to SUPER_ADMIN in
 * middleware.ts, the same way /stores is; getAllSupportTickets re-checks the
 * role itself too, so this page is safe even if the route gate were ever
 * bypassed or reused elsewhere.
 *
 * A dedicated route rather than a section of /contact-faq — that page is
 * already a multi-section read+manage view for every role, and a real
 * inbox (filterable list → full thread → reply → status change) needs its
 * own room rather than being squeezed in further down an unrelated page.
 */
export default async function SupportTicketsPage({ searchParams }: SupportTicketsPageProps) {
  const params = (await searchParams) ?? {}
  const statusParam = params.status as TicketStatus | undefined
  const activeStatus: TicketStatus | "ALL" =
    statusParam && Object.values(TicketStatus).includes(statusParam) ? statusParam : "ALL"

  const tickets = await getAllSupportTickets(
    activeStatus === "ALL" ? {} : { status: activeStatus },
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Support Tickets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every ticket submitted through Contact Us, from the public site and every store.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === "ALL" ? "/support-tickets" : `/support-tickets?status=${filter.value}`}
            className={cn(
              "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
              activeStatus === filter.value
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tickets.length} {tickets.length === 1 ? "Ticket" : "Tickets"}</CardTitle>
        </CardHeader>
        <CardContent>
          {tickets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No tickets {activeStatus === "ALL" ? "yet" : "with this status"}.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => (
                  <TableRow key={ticket.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/support-tickets/${ticket.id}`} className="hover:underline">
                        {ticket.subject}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{ticket.submitterName}</div>
                      <div className="text-xs text-muted-foreground">{ticket.submitterEmail}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ticket.storeName ?? "— (public site)"}
                    </TableCell>
                    <TableCell>
                      <TicketStatusBadge status={ticket.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ticket.messageCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(ticket.lastMessageAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
