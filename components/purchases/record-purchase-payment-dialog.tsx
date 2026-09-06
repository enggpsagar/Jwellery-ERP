"use client"

import { useEffect, useMemo, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"

import { recordPurchasePayment, type PurchaseFormState } from "@/lib/actions/purchase-actions"
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
import {
  PaymentMethodFields,
  emptyPaymentMethodValue,
  type PaymentMethodValue,
} from "@/components/shared/payment-method-fields"

const initialState: PurchaseFormState = { success: false, message: "" }

type RecordPurchasePaymentDialogProps = {
  purchaseId: string
  balanceAmount: number
}

export function RecordPurchasePaymentDialog({
  purchaseId,
  balanceAmount,
}: RecordPurchasePaymentDialogProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const toast = useToast()

  const [rows, setRows] = useState<PaymentMethodValue[]>([
    { ...emptyPaymentMethodValue(), amount: balanceAmount },
  ])

  const recordPaymentWithId = recordPurchasePayment.bind(null, purchaseId)
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

  useEffect(() => {
    if (open) {
      setRows([{ ...emptyPaymentMethodValue(), amount: balanceAmount }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (balanceAmount <= 0) return null

  const updateRow = (index: number, patch: Partial<PaymentMethodValue>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const addSplit = () => setRows((prev) => [...prev, emptyPaymentMethodValue()])
  const removeSplit = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index))

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + (row.amount || 0), 0),
    [rows],
  )
  const overBalance = total > balanceAmount
  const invalidTotal = total <= 0 || overBalance

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
      <DialogTrigger asChild>
        <Button>Record Payment</Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
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
            <div className="text-red-600 text-sm">{state.message}</div>
          )}

          <div className="text-sm text-red-600 font-medium">
            Balance: ₹{balanceAmount.toFixed(2)}
          </div>

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
                <PaymentMethodFields
                  value={row}
                  onChange={(patch) => updateRow(index, patch)}
                  maxAmount={balanceAmount}
                />
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
            <span className={overBalance ? "text-red-600" : "text-blue-600"}>₹{total.toFixed(2)}</span>
          </div>
          {overBalance && (
            <div className="text-xs text-red-600">
              Total exceeds the outstanding balance of ₹{balanceAmount.toFixed(2)}
            </div>
          )}

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
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
