"use client"

import { useState, useTransition } from "react"
import { Mail } from "lucide-react"

import { sendRenewalContactRequestAction } from "@/lib/actions/store-plan-actions"
import { useToast } from "@/components/providers/toast-provider"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RequiredMark } from "@/components/shared/required-mark"

/**
 * Replaces the old `mailto:` link on My Plan — that only worked if the
 * browser had a mail client configured, and left no record on our side that
 * a store had asked about renewal at all. This sends straight to the Super
 * Admin(s) instead.
 */
export function RenewalContactDialog() {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState("")
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // Reset once the dialog has closed, so reopening it never shows a
      // stale success state or a leftover draft from last time.
      setContent("")
      setSent(false)
    }
  }

  function handleSend() {
    startTransition(async () => {
      const result = await sendRenewalContactRequestAction(content)

      if (!result.success) {
        toast.error(result.message)
        return
      }

      toast.success(result.message)
      setSent(true)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Mail className="size-4" />
          Contact us about renewal
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact us about renewal</DialogTitle>
        </DialogHeader>

        {sent ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Your message has been sent. We&apos;ll get back to you shortly.
          </p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="renewal-email-content">
              Email Content <RequiredMark />
            </Label>
            <Textarea
              id="renewal-email-content"
              rows={6}
              placeholder="Let us know what you need for your renewal..."
              value={content}
              onChange={(event) => setContent(event.target.value)}
              disabled={isPending}
            />
          </div>
        )}

        <DialogFooter>
          {sent ? (
            <Button onClick={() => handleOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSend}
                disabled={isPending || content.trim().length === 0}
              >
                {isPending ? "Sending..." : "Send"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
