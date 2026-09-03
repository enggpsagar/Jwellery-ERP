"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { TicketStatus } from "@prisma/client"

import {
  updateSupportTicketStatus,
  type SupportTicketDetail,
} from "@/lib/actions/support-ticket-actions"
import { TICKET_STATUS_LABEL } from "@/components/support/ticket-status-badge"
import { TicketMessageBubbles } from "@/components/support/ticket-message-bubbles"
import { TicketReplyForm } from "@/components/support/ticket-reply-form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/components/providers/toast-provider"

/**
 * SUPER_ADMIN's ticket view: the thread, a status changer, and the shared
 * reply box. Status can be changed independently of replying (e.g. closing
 * a duplicate with no reply needed) — replying on its own also nudges
 * OPEN → IN_PROGRESS automatically, see replySupportTicket's own comment.
 */
export function AdminTicketDetail({ ticket }: { ticket: SupportTicketDetail }) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<TicketStatus>(ticket.status)

  function handleStatusChange(next: TicketStatus) {
    setStatus(next)
    startTransition(async () => {
      const result = await updateSupportTicketStatus(ticket.id, next)
      if (result.success) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.message)
        setStatus(ticket.status)
      }
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Status</span>
        <Select value={status} disabled={isPending} onValueChange={(value) => handleStatusChange(value as TicketStatus)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(TicketStatus).map((value) => (
              <SelectItem key={value} value={value}>
                {TICKET_STATUS_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <TicketMessageBubbles messages={ticket.messages} />

      <Separator />

      <TicketReplyForm ticketId={ticket.id} onSent={() => router.refresh()} />
    </div>
  )
}
