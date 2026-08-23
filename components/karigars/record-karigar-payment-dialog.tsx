"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"

import {
  recordKarigarPayment,
  type StockActionState,
} from "@/lib/actions/inventory-stock-actions"
import { useToast } from "@/components/providers/toast-provider"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const initialState: StockActionState = { success: false, message: "" }

type RecordKarigarPaymentDialogProps = {
  karigarId: string
}

export function RecordKarigarPaymentDialog({
  karigarId,
}: RecordKarigarPaymentDialogProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const toast = useToast()

  const recordPaymentWithId = recordKarigarPayment.bind(null, karigarId)
  const [state, formAction, pending] = useActionState(recordPaymentWithId, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Payment recorded")
      setOpen(false)
      router.refresh()
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Record Payment
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment to Karigar</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {!state.success && state.message && (
            <div className="text-sm text-red-600">{state.message}</div>
          )}

          <div className="space-y-2">
            <Label>Amount *</Label>
            <Input name="amount" type="number" step="0.01" min="0" required />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea name="notes" rows={2} placeholder="e.g. Cash, UPI, cheque #..." />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
