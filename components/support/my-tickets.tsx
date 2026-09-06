"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp } from "lucide-react"

import {
  getMyTicketThread,
  type SupportTicketDetail,
  type SupportTicketRow,
} from "@/lib/actions/support-ticket-actions"
import { TicketStatusBadge } from "@/components/support/ticket-status-badge"
import { TicketMessageBubbles } from "@/components/support/ticket-message-bubbles"
import { TicketReplyForm } from "@/components/support/ticket-reply-form"
import { Loader } from "@/components/ui/loader"

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso))
}

type MyTicketsProps = {
  tickets: SupportTicketRow[]
  /** From ?ticket=<id> on /contact-faq — e.g. a link out of a reply email —
   *  so landing here opens straight into that ticket's thread. */
  initialExpandedId?: string | null
}

/**
 * The submitter's own view of their tickets — list + expand-in-place into
 * the full two-way thread, right on /contact-faq where they submitted it
 * (see the module doc comment in support-ticket-actions.ts for why this
 * lives here rather than a separate route).
 */
export function MyTickets({ tickets, initialExpandedId }: MyTicketsProps) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId ?? null)
  const [threads, setThreads] = useState<Record<string, SupportTicketDetail | null>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const loadThread = useCallback(async (ticketId: string) => {
    setLoadingId(ticketId)
    try {
      const detail = await getMyTicketThread(ticketId)
      setThreads((prev) => ({ ...prev, [ticketId]: detail }))
    } catch (error) {
      console.error("Failed to load ticket thread:", error)
      setThreads((prev) => ({ ...prev, [ticketId]: null }))
    } finally {
      setLoadingId(null)
    }
  }, [])

  useEffect(() => {
    if (initialExpandedId) {
      void loadThread(initialExpandedId)
    }
    // Only ever runs for the id the page loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle(ticketId: string) {
    const next = expandedId === ticketId ? null : ticketId
    setExpandedId(next)
    if (next && !threads[next]) {
      void loadThread(next)
    }
  }

  if (tickets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You haven&apos;t submitted any tickets yet.
      </p>
    )
  }

  return (
    <div className="space-y-2.5">
      {tickets.map((ticket) => {
        const isOpen = expandedId === ticket.id
        return (
          <div key={ticket.id} className="rounded-md border">
            <button
              type="button"
              onClick={() => toggle(ticket.id)}
              className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
              aria-expanded={isOpen}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{ticket.ticketNumber}</span>
                  <span className="truncate font-medium">{ticket.subject}</span>
                  <TicketStatusBadge status={ticket.status} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {ticket.messageCount} {ticket.messageCount === 1 ? "message" : "messages"} · last
                  activity {formatDate(ticket.lastMessageAt)}
                </p>
              </div>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>

            {isOpen ? (
              <div className="border-t px-3.5 py-3.5">
                {loadingId === ticket.id && !threads[ticket.id] ? (
                  <div className="flex justify-center py-4">
                    <Loader className="h-5 w-5" />
                  </div>
                ) : threads[ticket.id] ? (
                  <div className="space-y-4">
                    <TicketMessageBubbles messages={threads[ticket.id]!.messages} />
                    <TicketReplyForm
                      ticketId={ticket.id}
                      onSent={() => {
                        void loadThread(ticket.id)
                        router.refresh()
                      }}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Could not load this ticket.</p>
                )}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
