"use client"

import { useEffect, useMemo, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"

import {
  convertQuotationToInvoice,
  type QuotationFormState,
} from "@/lib/actions/quotation-actions"
import { useToast } from "@/components/providers/toast-provider"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

const initialState: QuotationFormState = { success: false, message: "" }

type QuotationSummary = {
  id: string
  quotationNumber: string
  subtotal: number
  makingCharges: number
  stoneCharges: number
  discount: number
  totalAmount: number
  notes: string | null
  customer: {
    name: string
    phone: string | null
  } | null
  items: {
    id: string
    itemName: string
    quantity: number
    netWeight: number | null
    rate: number | null
    lineTotal: number
  }[]
}

type ConvertToInvoiceFormProps = {
  quotation: QuotationSummary
  defaultTaxAmount?: number
}

export function ConvertToInvoiceForm({
  quotation,
  defaultTaxAmount = 0,
}: ConvertToInvoiceFormProps) {
  const router = useRouter()
  const toast = useToast()

  const subtotalBeforeTax =
    quotation.subtotal +
    quotation.makingCharges +
    quotation.stoneCharges -
    quotation.discount

  const [taxAmount, setTaxAmount] = useState(defaultTaxAmount)
  const [paidAmount, setPaidAmount] = useState(0)
  const [notes, setNotes] = useState(quotation.notes ?? "")

  const totalAmount = useMemo(
    () => subtotalBeforeTax + taxAmount,
    [subtotalBeforeTax, taxAmount],
  )
  const balanceAmount = Math.max(0, totalAmount - paidAmount)

  const convertAction = convertQuotationToInvoice.bind(null, quotation.id)
  const [state, formAction, pending] = useActionState(convertAction, initialState)

  useEffect(() => {
    if (state.success && state.invoiceId) {
      toast.success(state.message || "Converted to Invoice")
      router.push(`/billing/${state.invoiceId}`)
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
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
      className="space-y-6"
    >
      <input type="hidden" name="taxAmount" value={taxAmount} />
      <input type="hidden" name="paidAmount" value={paidAmount} />

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">From Quotation {quotation.quotationNumber}</h2>

        <div className="overflow-hidden rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b">
                <th className="px-4 py-2 text-left font-medium">Item</th>
                <th className="px-4 py-2 text-left font-medium">Qty</th>
                <th className="px-4 py-2 text-left font-medium">Net Wt (g)</th>
                <th className="px-4 py-2 text-left font-medium">Rate</th>
                <th className="px-4 py-2 text-left font-medium">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {quotation.items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-4 py-2">{item.itemName}</td>
                  <td className="px-4 py-2">{item.quantity}</td>
                  <td className="px-4 py-2">{item.netWeight?.toFixed(3) ?? "-"}</td>
                  <td className="px-4 py-2">{item.rate ? `₹${item.rate.toFixed(2)}` : "-"}</td>
                  <td className="px-4 py-2 font-medium">₹{item.lineTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Invoice Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Tax Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={taxAmount === 0 ? "" : taxAmount}
              onChange={(e) => setTaxAmount(Number(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>Paid Now</Label>
            <Input
              type="number"
              step="0.01"
              value={paidAmount === 0 ? "" : paidAmount}
              onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>Due Date</Label>
            <Input type="date" name="dueDate" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            name="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-1 text-sm max-w-sm ml-auto">
        <div className="flex justify-between">
          <span>Subtotal + Charges</span>
          <span>₹{subtotalBeforeTax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span>₹{taxAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
          <span>Total</span>
          <span>₹{totalAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Paid Now</span>
          <span>₹{paidAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-red-600 font-medium">
          <span>Balance Due</span>
          <span>₹{balanceAmount.toFixed(2)}</span>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Converting..." : "Convert to Invoice"}
      </Button>
    </form>
  )
}
