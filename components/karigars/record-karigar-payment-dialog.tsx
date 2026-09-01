"use client"

import { useEffect, useMemo, useState } from "react"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  PaymentMethodFields,
  emptyPaymentMethodValue,
  type PaymentMethodValue,
} from "@/components/shared/payment-method-fields"

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

  const [rows, setRows] = useState<PaymentMethodValue[]>([emptyPaymentMethodValue()])

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

  useEffect(() => {
    if (open) {
      setRows([emptyPaymentMethodValue()])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const updateRow = (index: number, patch: Partial<PaymentMethodValue>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const addSplit = () => setRows((prev) => [...prev, emptyPaymentMethodValue()])
  const removeSplit = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index))

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + (row.amount || 0), 0),
    [rows],
  )
  const invalidTotal = total <= 0

  const paymentsJson = JSON.stringify(
    rows.map((row) => ({
      method: row.method,
      amount: row.amount,
      reference: row.reference || null,
      bankName: row.bankName || null,
      attachmentUrl: row.attachmentUrl || null,
    })),
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Record Payment
      </Button>

      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Payment to Karigar</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            // Deliberately not `action={formAction}` directly on the form:
            // React resets a form's uncontrolled fields once an action-bound
            // submission settles, regardless of whether the action's own
            // returned state says success or failure — so a plain validation
            // error wiped every other field the user had already typed.
            // Calling the same dispatcher by hand from a prevented submit
            // sidesteps that auto-reset while keeping identical pending/error-
            // state behavior.
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          <input type="hidden" name="paymentsJson" value={paymentsJson} />

          {!state.success && state.message && (
            <div className="text-sm text-red-600">{state.message}</div>
          )}

          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={index} className="rounded-lg border p-3 space-y-3">
                {index > 0 && (
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      Second payment method
                    </Label>
                    <button
                      type="button"
                      onClick={() => removeSplit(index)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                )}
                <PaymentMethodFields value={row} onChange={(patch) => updateRow(index, patch)} />
              </div>
            ))}
          </div>

          {rows.length < 2 && (
            <button
              type="button"
              onClick={addSplit}
              className="text-sm text-primary hover:underline"
            >
              + Split into a second payment method
            </button>
          )}

          <div className="flex items-center justify-between text-sm font-medium border-t pt-3">
            <span>Total</span>
            <span>₹{total.toFixed(2)}</span>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea name="notes" rows={2} placeholder="Optional notes..." />
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
            <Button type="submit" disabled={pending || invalidTotal}>
              {pending ? "Saving..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
