"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"

import {
  recordKachaInvoicePayment,
  type KachaInvoiceFormState,
} from "@/lib/actions/kacha-invoice-actions"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const initialState: KachaInvoiceFormState = { success: false, message: "" }

type RecordKachaPaymentDialogProps = {
  kachaInvoiceId: string
  balanceAmount: number
}

export function RecordKachaPaymentDialog({
  kachaInvoiceId,
  balanceAmount,
}: RecordKachaPaymentDialogProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const toast = useToast()

  const recordPaymentWithId = recordKachaInvoicePayment.bind(null, kachaInvoiceId)
  const [state, formAction, pending] = useActionState(
    recordPaymentWithId,
    initialState,
  )

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Payment recorded")
      setOpen(false)
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  if (balanceAmount <= 0) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Record Payment</Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {!state.success && state.message && (
            <div className="text-red-600 text-sm">{state.message}</div>
          )}

          <div className="space-y-2">
            <Label required>Amount (Balance: ₹{balanceAmount.toFixed(2)})</Label>
            <Input
              name="amount"
              type="number"
              step="0.01"
              max={balanceAmount}
              defaultValue={balanceAmount}
              required
            />
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
