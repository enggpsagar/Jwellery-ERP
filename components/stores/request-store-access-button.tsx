"use client"

import { useActionState, useEffect, useState } from "react"
import { Check, Copy, KeyRound, Send } from "lucide-react"

import {
  getMyStoreAccess,
  requestStoreAccess,
  type CollaborationActionState,
  type MyStoreAccessState,
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
 * Collaboration. Self-fetches its own access state on mount rather than
 * threading it through StoreDetailPanel's existing fetch, since this is
 * the only place that needs it.
 *
 * Once this Super Admin already holds a live grant for the store (redeemed
 * code or an approved request), this renders the store's collaboration
 * code instead — re-offering "Request access" to someone who already has
 * access reads as broken, and there is nothing left for them to request.
 * That only reverts to the request flow if the owner generates a new code,
 * which retires the old grant (see getMyStoreAccess).
 */
export function RequestStoreAccessButton({
  storeId,
  storeName,
}: {
  storeId: string
  storeName: string
}) {
  const [access, setAccess] = useState<MyStoreAccessState | null>(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const toast = useToast()

  const [state, formAction, pending] = useActionState(
    requestStoreAccess.bind(null, storeId),
    initialState,
  )

  useEffect(() => {
    getMyStoreAccess(storeId).then(setAccess)
  }, [storeId])

  useEffect(() => {
    if (state.success) {
      toast.success(state.message)
      setOpen(false)
      setAccess({ hasAccess: false, requestStatus: "PENDING" })
    } else if (state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const handleCopy = async (code: string) => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!access) {
    return (
      <Button type="button" variant="outline" size="sm" disabled className="gap-2">
        <KeyRound className="size-4" />
        Access
      </Button>
    )
  }

  if (access.hasAccess) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 border-transparent bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
          >
            <KeyRound className="size-4" />
            Access granted
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Your access to {storeName}</DialogTitle>
            <DialogDescription>
              You already have standing access to this store&apos;s data. This
              is its current collaboration code, for reference.
            </DialogDescription>
          </DialogHeader>

          {access.code ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
              <code className="flex-1 font-mono text-lg font-semibold tracking-wider">
                {access.code}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleCopy(access.code!)}
                aria-label="Copy code"
                title="Copy code"
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No code on file for this store.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const { requestStatus } = access

  if (requestStatus === "PENDING") {
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 border-transparent bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
        >
          <Send className="size-4" />
          {requestStatus === "DENIED" ? "Request access again" : "Request access"}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Request access to {storeName}</DialogTitle>
          <DialogDescription>
            {storeName}&apos;s owner sees this in Settings &gt; Collaboration
            and can approve or deny it. You get no access until they do.
            {requestStatus === "DENIED" && " Your last request here was denied."}
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
