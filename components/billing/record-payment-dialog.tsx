"use client"

import { useEffect, useMemo, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"

import { recordInvoicePayment, type InvoiceFormState } from "@/lib/actions/invoice-actions"
import { getCustomerAvailableCredit } from "@/lib/actions/payments-actions"
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
import {
  PaymentMethodFields,
  emptyPaymentMethodValue,
  type PaymentMethodValue,
} from "@/components/shared/payment-method-fields"

const initialState: InvoiceFormState = { success: false, message: "" }

type RecordPaymentDialogProps = {
  invoiceId: string
  balanceAmount: number
  /** The invoice's own party — looked up fresh every time the dialog opens
   * to see whether they have any existing store credit (a prior Credit
   * Note, an overpayment) worth offering to apply here instead of new
   * cash. See customerCredit's own effect below. */
  customerId?: string
}

export function RecordPaymentDialog({
  invoiceId,
  balanceAmount,
  customerId,
}: RecordPaymentDialogProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const toast = useToast()

  const [rows, setRows] = useState<PaymentMethodValue[]>([
    { ...emptyPaymentMethodValue(), amount: balanceAmount },
  ])
  const [customerCredit, setCustomerCredit] = useState(0)
  const [creditApplied, setCreditApplied] = useState(0)

  const recordPaymentWithId = recordInvoicePayment.bind(null, invoiceId)
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
      setCreditApplied(0)
      if (customerId) {
        getCustomerAvailableCredit(customerId)
          .then(setCustomerCredit)
          .catch((err) => console.error("Failed to load customer credit:", err))
      } else {
        setCustomerCredit(0)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (balanceAmount <= 0) return null

  const updateRow = (index: number, patch: Partial<PaymentMethodValue>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const addSplit = () => setRows((prev) => [...prev, emptyPaymentMethodValue()])
  const removeSplit = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index))

  // The single payment-method row is prefilled to the full balance so one
  // click settles the whole thing — applying/removing credit keeps that
  // promise by shrinking/restoring that same row rather than leaving it
  // stuck at the old (now over-balance) figure. Only for the single-row
  // case; a deliberate 2-way split is left for the user to rebalance by
  // hand, same as invoice-form.tsx's own "Apply Credit".
  const creditCap = Math.min(customerCredit, balanceAmount)
  const applyCredit = () => {
    setCreditApplied(creditCap)
    if (rows.length === 1) updateRow(0, { amount: Math.max(0, balanceAmount - creditCap) })
  }
  const removeCredit = () => {
    setCreditApplied(0)
    if (rows.length === 1) updateRow(0, { amount: balanceAmount })
  }

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + (row.amount || 0), 0) + creditApplied,
    [rows, creditApplied],
  )
  const overBalance = total > balanceAmount
  const invalidTotal = total <= 0 || overBalance

  // Dropped, not sent as a zero-amount row — applying credit auto-shrinks
  // the single cash row down to whatever's left (possibly 0, when credit
  // covers the whole balance), and the server rejects a row with no real
  // amount rather than silently ignoring it. Same convention as
  // invoice-form.tsx's own paymentsJson.
  const paymentsJson = JSON.stringify(
    rows
      .filter((row) => row.amount > 0)
      .map((row) => ({
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
        <Button variant="success" className="gap-2">
          Record Payment
        </Button>
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
          <input type="hidden" name="creditApplied" value={creditApplied} />

          {!state.success && state.message && (
            <div className="text-red-600 text-sm">{state.message}</div>
          )}

          <div className="text-sm text-red-600 font-medium">
            Balance: ₹{balanceAmount.toFixed(2)}
          </div>

          {customerCredit > 0 && (
            <div className="rounded-md border border-emerald-600/30 bg-emerald-600/10 p-2.5 text-sm">
              {creditApplied > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-emerald-800">Credit Applied</span>
                    <button
                      type="button"
                      onClick={removeCredit}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    max={creditCap}
                    value={creditApplied}
                    onChange={(e) =>
                      setCreditApplied(Math.min(Math.max(0, Number(e.target.value) || 0), creditCap))
                    }
                    className="h-9"
                  />
                  <p className="text-xs text-emerald-700">Up to ₹{customerCredit.toFixed(2)} available.</p>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-emerald-800">
                    This customer has <span className="font-semibold">₹{customerCredit.toFixed(2)}</span> credit available.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-emerald-600/40 text-emerald-800 hover:bg-emerald-600/10"
                    onClick={applyCredit}
                  >
                    Apply Credit
                  </Button>
                </div>
              )}
            </div>
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
                <PaymentMethodFields
                  value={row}
                  onChange={(patch) => updateRow(index, patch)}
                  maxAmount={Math.max(0, balanceAmount - creditApplied)}
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
