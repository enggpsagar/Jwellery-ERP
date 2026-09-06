"use client"

import { Label } from "@/components/ui/label"
import {
  PaymentMethodFields,
  emptyPaymentMethodValue,
  type PaymentMethodValue,
} from "@/components/shared/payment-method-fields"

type PaidNowFieldsProps = {
  rows: PaymentMethodValue[]
  onRowsChange: (rows: PaymentMethodValue[]) => void
  /** The document's current total — an amount collected at creation can
   * never exceed it. Undefined (rather than 0) while the total hasn't been
   * priced yet, so the underlying amount input doesn't lock at max=0. */
  maxAmount?: number
}

/**
 * "Paid Now" at document-CREATION time (Invoice/Kacha Slip/Purchase forms) —
 * the creation-time counterpart to the "Record Payment" dialogs shown on an
 * existing document's detail page. Reuses the identical PaymentMethodFields
 * component those dialogs use (method + method-specific fields + optional
 * receipt) so a payment collected at the moment of sale/purchase gets the
 * same method/reference/bank/attachment breakdown a later top-up payment
 * already does — see CLAUDE.md-adjacent task notes on this codebase's
 * payment-method gap.
 *
 * Unlike the Record Payment dialogs (which only ever appear once a real
 * positive balance exists to collect against), a fresh document has no
 * payment at all by default — `rows` starts empty and stays empty for a
 * fully-on-credit sale/purchase. `paidAmount` for the document is always
 * derived by the caller from `rows` (sum of each row's amount) rather than
 * tracked as separate state, so it can never go stale relative to the rows
 * actually entered.
 */
export function PaidNowFields({ rows, onRowsChange, maxAmount }: PaidNowFieldsProps) {
  const updateRow = (index: number, patch: Partial<PaymentMethodValue>) => {
    onRowsChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const addSplit = () => onRowsChange([...rows, emptyPaymentMethodValue()])
  const removeRow = (index: number) => onRowsChange(rows.filter((_, i) => i !== index))

  const total = rows.reduce((sum, row) => sum + (row.amount || 0), 0)
  const overMax = maxAmount !== undefined && total > maxAmount

  if (rows.length === 0) {
    return (
      <div className="space-y-2">
        <Label>Paid Now</Label>
        <div>
          <button
            type="button"
            onClick={() => onRowsChange([emptyPaymentMethodValue()])}
            className="text-sm text-primary hover:underline"
          >
            + Record a payment received now
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Leave this blank for a fully on-credit document.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Label>Paid Now</Label>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                {index === 0 ? "Payment method" : "Second payment method"}
              </Label>
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
            <PaymentMethodFields
              value={row}
              onChange={(patch) => updateRow(index, patch)}
              maxAmount={maxAmount}
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

      {overMax && (
        <div className="text-xs text-red-600">
          Total paid (₹{total.toFixed(2)}) exceeds the document total
          {maxAmount !== undefined ? ` of ₹${maxAmount.toFixed(2)}` : ""}.
        </div>
      )}
    </div>
  )
}
