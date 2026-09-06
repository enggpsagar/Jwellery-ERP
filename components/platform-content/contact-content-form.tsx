"use client"

import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"

import {
  updatePlatformContactContent,
  type PlatformContactContentRow,
  type PlatformContentFormState,
} from "@/lib/actions/platform-content-actions"
import { ContactImageUpload } from "@/components/platform-content/contact-image-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RichTextEditor } from "@/components/shared/rich-text-editor"
import { useToast } from "@/components/providers/toast-provider"

const initialState: PlatformContentFormState = { success: false, message: "" }

/**
 * SUPER_ADMIN editor for the platform-wide Contact Us content.
 */
export function ContactContentForm({
  content,
}: {
  content: PlatformContactContentRow
}) {
  const router = useRouter()
  const toast = useToast()
  const [state, formAction, isPending] = useActionState(
    updatePlatformContactContent,
    initialState,
  )

  useEffect(() => {
    if (state.success && state.message) {
      toast.success(state.message)
      router.refresh()
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <form
      onSubmit={(event) => {
        // See settings-form.tsx for why this isn't `action={formAction}`
        // directly — a validation error would otherwise wipe every other
        // field the admin had already typed.
        event.preventDefault()
        formAction(new FormData(event.currentTarget))
      }}
      className="space-y-5"
    >
      <div className="space-y-1.5">
        <Label>Image</Label>
        <ContactImageUpload imageUrl={content.imageUrl} />
        <p className="text-xs text-muted-foreground">
          Shown beside the message on the public Contact Us page. PNG or JPG, up to 2MB.
        </p>
      </div>

      <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor="message" required>
          Message
        </Label>
        <RichTextEditor
          id="message"
          name="message"
          defaultValue={content.message}
          placeholder="Have a question or need help with your account? Reach out and we'll get back to you."
          required
        />
        {state.errors?.message?.[0] ? (
          <p className="text-xs text-red-600">{state.errors.message[0]}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={content.email}
            placeholder="support@example.com"
          />
          {state.errors?.email?.[0] ? (
            <p className="text-xs text-red-600">{state.errors.email[0]}</p>
          ) : null}
        </div>

        <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={content.phone} />
        </div>

        <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label htmlFor="address">Address</Label>
          <Input id="address" name="address" defaultValue={content.address} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save Contact Us Content"}
        </Button>
      </div>
    </form>
  )
}
