"use client"

import { useActionState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

import {
  submitAuthenticatedSupportTicket,
  submitPublicSupportTicket,
  type SupportTicketFormState,
} from "@/lib/actions/support-ticket-actions"
import { RichTextEditor } from "@/components/shared/rich-text-editor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader } from "@/components/ui/loader"
import { useToast } from "@/components/providers/toast-provider"

const initialState: SupportTicketFormState = { success: false, message: "" }

type SupportTicketFormProps = {
  /** "public": app/contact/page.tsx, no session — name/email/phone are all
   *  free-typed. "authenticated": app/(dashboard)/contact-faq/page.tsx —
   *  attributed to the signed-in user; email/phone are pre-filled from
   *  their profile but stay real, required, editable fields (a user with
   *  no phone/email on file must supply one, not have it silently skipped). */
  mode: "public" | "authenticated"
  defaults?: { name: string; email: string; phone: string }
  onSubmitted?: () => void
}

/**
 * The "Contact Us" submission form that turns into a support ticket — see
 * lib/actions/support-ticket-actions.ts. Reuses RichTextEditor for the
 * message body, same convention as the Contact Us content / FAQ answer
 * editors elsewhere in this feature area.
 */
export function SupportTicketForm({ mode, defaults, onSubmitted }: SupportTicketFormProps) {
  const router = useRouter()
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const action = mode === "public" ? submitPublicSupportTicket : submitAuthenticatedSupportTicket
  const [state, formAction, isPending] = useActionState(action, initialState)

  useEffect(() => {
    if (state.success && state.message) {
      toast.success(state.message)
      formRef.current?.reset()
      // Refreshes the surrounding server component — on /contact-faq that's
      // what makes the new ticket show up in "My Tickets" without a manual
      // reload. A no-op-ish extra fetch on the public page, which has no
      // authenticated list to refresh.
      router.refresh()
      onSubmitted?.()
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        // Same reasoning as contact-content-form.tsx: prevents a validation
        // error from wiping every other field the visitor already typed.
        event.preventDefault()
        formAction(new FormData(event.currentTarget))
      }}
      className="space-y-4"
    >
      {mode === "public" ? (
        <div className="space-y-1.5">
          <Label htmlFor="ticket-name" required>
            Your Name
          </Label>
          <Input id="ticket-name" name="name" placeholder="Full name" required />
          {state.errors?.name?.[0] ? (
            <p className="text-xs text-red-600">{state.errors.name[0]}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ticket-email" required>
            Email
          </Label>
          <Input
            id="ticket-email"
            name="email"
            type="email"
            defaultValue={defaults?.email ?? ""}
            placeholder="you@example.com"
            required
          />
          {state.errors?.email?.[0] ? (
            <p className="text-xs text-red-600">{state.errors.email[0]}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ticket-phone" required>
            Phone
          </Label>
          <Input
            id="ticket-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            defaultValue={defaults?.phone ?? ""}
            placeholder="10-digit mobile number"
            required
          />
          {state.errors?.phone?.[0] ? (
            <p className="text-xs text-red-600">{state.errors.phone[0]}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ticket-subject" required>
          Subject
        </Label>
        <Input
          id="ticket-subject"
          name="subject"
          placeholder="What's this about?"
          required
        />
        {state.errors?.subject?.[0] ? (
          <p className="text-xs text-red-600">{state.errors.subject[0]}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ticket-message" required>
          Message
        </Label>
        <RichTextEditor
          // Remounts on a successful submit so TipTap's own uncontrolled
          // editor state clears too — formRef.current?.reset() above only
          // resets native inputs, not the editor.
          key={state.success ? state.message : "ticket-message"}
          id="ticket-message"
          name="message"
          placeholder="Tell us what's going on…"
          required
        />
        {state.errors?.message?.[0] ? (
          <p className="text-xs text-red-600">{state.errors.message[0]}</p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader className="h-4 w-4" /> : "Submit Ticket"}
        </Button>
      </div>
    </form>
  )
}
