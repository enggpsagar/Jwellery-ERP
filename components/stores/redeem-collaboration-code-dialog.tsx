"use client"

import { useActionState, useEffect, useState } from "react"
import { KeyRound } from "lucide-react"

import {
  redeemCollaborationCode,
  type CollaborationActionState,
} from "@/lib/actions/store-collaboration-actions"
import { useToast } from "@/components/providers/toast-provider"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
 * The Super Admin's side of Store Owner Authorization — this store's data
 * stays out of reach until whatever the owner shared here matches the
 * store's current code. Every /stores page viewer is already a Super Admin
 * (route is Super-Admin-only), so no extra role check is needed here.
 */
export function RedeemCollaborationCodeDialog({
  storeId,
  storeName,
}: {
  storeId: string
  storeName: string
}) {
  const [open, setOpen] = useState(false)
  const toast = useToast()

  const [state, formAction, pending] = useActionState(
    redeemCollaborationCode.bind(null, storeId),
    initialState,
  )

  useEffect(() => {
    if (state.success) {
      toast.success(state.message)
      setOpen(false)
    } else if (state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <KeyRound className="size-4" />
          Access store
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Please provide the collaboration code to access this store</DialogTitle>
          <DialogDescription>
            Ask {storeName}&apos;s owner for their current code from Settings
            &gt; Collaboration. You get no access to this store&apos;s data
            until it matches.
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
            <Label htmlFor="code">Collaboration code</Label>
            <Input
              id="code"
              name="code"
              placeholder="XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              className="font-mono uppercase tracking-wider"
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Checking..." : "Redeem code"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
