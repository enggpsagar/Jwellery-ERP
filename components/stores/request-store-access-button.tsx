"use client"

import { useActionState, useEffect, useState } from "react"
import { Send } from "lucide-react"

import {
  getMyAccessRequestStatus,
  requestStoreAccess,
  type CollaborationActionState,
  type MyAccessRequestStatus,
} from "@/lib/actions/store-collaboration-actions"
import { useToast } from "@/components/providers/toast-provider"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const initialState: CollaborationActionState = { success: false, message: "" }

/**
 * The other direction of Store Owner Authorization — instead of waiting
 * for the owner to generate and share a Collaboration Code, a Super Admin
 * can ask directly here; the owner approves or denies it from Settings >
 * Collaboration. Self-fetches its own request status on mount rather than
 * threading it through StoreDetailPanel's existing fetch, since this is
 * the only place that needs it.
 */
export function RequestStoreAccessButton({
  storeId,
  storeName,
}: {
  storeId: string
  storeName: string
}) {
  const [status, setStatus] = useState<MyAccessRequestStatus | null>(null)
  const [open, setOpen] = useState(false)
  const toast = useToast()

  const [state, formAction, pending] = useActionState(
    requestStoreAccess.bind(null, storeId),
    initialState,
  )

  useEffect(() => {
    getMyAccessRequestStatus(storeId).then(setStatus)
  }, [storeId])

  useEffect(() => {
    if (state.success) {
      toast.success(state.message)
      setOpen(false)
      setStatus("PENDING")
    } else if (state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  if (status === "PENDING") {
    return (
      <Button type="button" variant="outline" size="sm" disabled className="gap-2">
        <Send className="size-4" />
        Request pending
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <Send className="size-4" />
          {status === "DENIED" ? "Request access again" : "Request access"}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Request access to {storeName}</DialogTitle>
          <DialogDescription>
            {storeName}&apos;s owner sees this in Settings &gt; Collaboration
            and can approve or deny it. You get no access until they do.
            {status === "DENIED" && " Your last request here was denied."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label htmlFor="message">Reason (optional)</Label>
            <Textarea id="message" name="message" rows={3} placeholder="Why do you need access?" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending..." : "Send request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
