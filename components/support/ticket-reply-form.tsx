"use client"

import { useActionState, useEffect, useRef } from "react"

import {
  replySupportTicket,
  type SupportTicketFormState,
} from "@/lib/actions/support-ticket-actions"
import { RichTextEditor } from "@/components/shared/rich-text-editor"
import { TicketAttachmentField } from "@/components/support/ticket-attachment-field"
import { Button } from "@/components/ui/button"
import { Loader } from "@/components/ui/loader"
import { useToast } from "@/components/providers/toast-provider"

const initialState: SupportTicketFormState = { success: false, message: "" }

type TicketReplyFormProps = {
  ticketId: string
  /** Called after a reply is sent successfully, so the caller can refetch
   *  the thread and/or the surrounding ticket list. */
  onSent?: () => void
}

/**
 * The one reply box both a SUPER_ADMIN (from the ticket inbox) and a
 * ticket's own submitter (from "My Tickets" on /contact-faq) use — same
 * server action either way (replySupportTicket re-derives which side is
 * replying and re-checks the caller actually owns this ticket).
 */
export function TicketReplyForm({ ticketId, onSent }: TicketReplyFormProps) {
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, isPending] = useActionState(replySupportTicket, initialState)

  useEffect(() => {
    if (state.success && state.message) {
      toast.success(state.message)
      formRef.current?.reset()
      onSent?.()
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault()
        formAction(new FormData(event.currentTarget))
      }}
      className="space-y-2.5"
    >
      <input type="hidden" name="ticketId" value={ticketId} />

      {/* Keyed on the pending state so a fresh editor mounts after each send
          — RichTextEditor holds its own uncontrolled TipTap instance and
          `formRef.current?.reset()` above only resets the hidden input, not
          the visible editor. */}
      <RichTextEditor
        key={state.success ? state.message : "reply"}
        name="body"
        placeholder="Write a reply…"
        required
      />
      {state.errors?.body?.[0] ? (
        <p className="text-xs text-red-600">{state.errors.body[0]}</p>
      ) : null}

      {/* Same remount-on-success convention as RichTextEditor above. The
          ticket already exists here (unlike the initial submission form),
          so the attachment's blob path is scoped to this ticket's own id. */}
      <TicketAttachmentField
        key={state.success ? `${state.message}-attachment` : "reply-attachment"}
        ticketId={ticketId}
      />

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? <Loader className="h-4 w-4" /> : "Send Reply"}
        </Button>
      </div>
    </form>
  )
}
