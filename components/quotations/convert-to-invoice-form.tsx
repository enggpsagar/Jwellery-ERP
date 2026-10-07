"use client"

import { useWeightFormat } from "@/components/providers/weight-settings-provider"
import { useEffect, useMemo, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"

import {
  convertQuotationToInvoice,
  type QuotationExchangeEstimate,
  type QuotationFormState,
} from "@/lib/actions/quotation-actions"
import { computeRoundOff } from "@/lib/round-off"
import { conversionGst } from "@/lib/conversion-gst"
import type { GstScheme } from "@prisma/client"
import { splitOldGoldValue, type OldGoldExcessModeValue } from "@/lib/old-gold/value"
import { QuotationExchangeEstimateCard } from "@/components/quotations/quotation-exchange-estimate"
import { useToast } from "@/components/providers/toast-provider"
import { todayForDateInput } from "@/lib/date-input"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { GstRateRow } from "@/lib/actions/gst-rate-actions"

const initialState: QuotationFormState = { success: false, message: "" }

// Same PaymentMethod values New Invoice's exchange payout offers.
const PAYOUT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "NET_BANKING", label: "Net Banking" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
]

type QuotationSummary = {
  id: string
  quotationNumber: string
  subtotal: number
  makingCharges: number
  stoneCharges: number
  discount: number
  totalAmount: number
  notes: string | null
  /** Customer Exchange estimate saved on the quotation, if any. */
  exchangeEstimate?: QuotationExchangeEstimate | null
  customer: {
    name: string
    phone: string | null
    state?: string | null
  } | null
  items: {
    id: string
    itemName: string
    quantity: number
    purity: string | null
    netWeight: number | null
    caratWeight: number | null
    rate: number | null
    makingCharge: number
    hmCharge: number
    stoneCharge: number
    lineTotal: number
    /** A piece made of several metals/stones — its rows, each with its own
     * snapshotted GST rate (lib/piece-components.ts). */
    components?: { amount: number; gstRatePercent?: number | null }[]
  }[]
}

type ConvertToInvoiceFormProps = {
  quotation: QuotationSummary
  /** The store's configured GST rates (Settings > GST Rates) — see the
   * same prop on InvoiceForm for the full explanation. Picking one here
   * recomputes Tax Amount from this quotation's own taxable base, same as
   * the server-computed defaultTaxAmount fallback used to. */
  gstRates: GstRateRow[]
  /** Last-resort fallback (BusinessSettings.defaultGstRate) — only used to
   * seed Tax Amount when the store somehow has zero GstRate rows. */
  defaultTaxAmount?: number
  /** BusinessSettings.showDueDate — hides the Due Date field when off.
   * Defaults true so an existing caller not yet passing this keeps
   * showing it. */
  showDueDate?: boolean
  /** For the tax preview — the same per-line computation the server runs
   * (lib/conversion-gst.ts). */
  gstScheme?: GstScheme
  storeState?: string | null
}

export function ConvertToInvoiceForm({
  quotation,
  gstRates,
  defaultTaxAmount = 0,
  showDueDate = true,
  gstScheme = "REGULAR_B2C",
  storeState = null,
}: ConvertToInvoiceFormProps) {
  const wf = useWeightFormat()
  const router = useRouter()
  const toast = useToast()

  const subtotalBeforeTax =
    quotation.subtotal +
    quotation.makingCharges +
    quotation.stoneCharges -
    quotation.discount

  const [gstRateId, setGstRateId] = useState<string>(
    () =>
      gstRates.find((r) => r.isDefault && r.isActive)?.id ??
      gstRates.find((r) => r.isActive)?.id ??
      "",
  )
  const activeGstRates = useMemo(() => gstRates.filter((r) => r.isActive), [gstRates])
  // Exactly what convertQuotationToInvoice will charge: per line, metal ×
  // quantity + making + HM + stone at the picked rate, a multi-part piece
  // row by row at each row's own rate (lib/conversion-gst.ts). The
  // quotation's discount comes off the total, not the tax base — as on a
  // direct invoice.
  const taxAt = (ratePercent: number) =>
    conversionGst(quotation.items, ratePercent, gstScheme, storeState, quotation.customer?.state ?? null).taxAmount
  const initialGstRate = gstRates.find((r) => r.id === gstRateId)
  const initialTaxAmount = initialGstRate ? taxAt(initialGstRate.ratePercent) : defaultTaxAmount

  const [taxAmount, setTaxAmount] = useState(initialTaxAmount)
  const [paidAmount, setPaidAmount] = useState(0)
  const [notes, setNotes] = useState(quotation.notes ?? "")

  // Picking a different GST Rate recomputes Tax Amount from this
  // quotation's own taxable base — the user can still hand-edit the ₹
  // figure afterward (e.g. a negotiated final tax), same as the old
  // server-precomputed defaultTaxAmount only ever seeded the field once.
  const handleGstRateChange = (id: string) => {
    setGstRateId(id)
    const rate = gstRates.find((r) => r.id === id)
    if (rate) {
      setTaxAmount(taxAt(rate.ratePercent))
    }
  }

  const totalAmount = useMemo(
    () => subtotalBeforeTax + taxAmount,
    [subtotalBeforeTax, taxAmount],
  )

  // Customer Exchange estimate → real exchange on this invoice, only when
  // the shop confirms the customer is handing it over now. The server
  // re-resolves the lines with today's data and splits against the
  // invoice's own rounded total less the cash paid now — previewed here
  // the same way (its value may move a little from the quoted one).
  const estimate = quotation.exchangeEstimate ?? null
  const [exchangeConfirm, setExchangeConfirm] = useState(true)
  const [exchangeExcessMode, setExchangeExcessMode] = useState<OldGoldExcessModeValue>("STORE_CREDIT")
  const [exchangePayoutMethod, setExchangePayoutMethod] = useState("")
  const [exchangePayoutReference, setExchangePayoutReference] = useState("")
  const exchangeActive = Boolean(estimate) && exchangeConfirm
  const roundedTotal = computeRoundOff(totalAmount).totalAmount
  const exchangeSplit = exchangeActive && estimate
    ? splitOldGoldValue(estimate.total, roundedTotal - paidAmount)
    : { applied: 0, excess: 0 }
  const exchangePayoutMissing =
    exchangeSplit.excess > 0 && exchangeExcessMode === "PAID_OUT" && !exchangePayoutMethod

  // Against the rounded total the server saves, not the raw sum.
  const balanceAmount = Math.max(0, roundedTotal - paidAmount - exchangeSplit.applied)

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
      <input type="hidden" name="gstRateId" value={gstRateId} />
      {estimate && (
        <>
          {exchangeConfirm && <input type="hidden" name="exchangeConfirm" value="on" />}
          <input type="hidden" name="exchangeExcessMode" value={exchangeExcessMode} />
          <input type="hidden" name="exchangePayoutMethod" value={exchangePayoutMethod} />
          <input type="hidden" name="exchangePayoutReference" value={exchangePayoutReference} />
        </>
      )}

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
                  <td className="px-4 py-2">{item.netWeight != null ? wf.g(item.netWeight) : "-"}</td>
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>GST Rate</Label>
            <Select value={gstRateId || undefined} onValueChange={handleGstRateChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select GST rate" />
              </SelectTrigger>
              <SelectContent>
                {activeGstRates.map((rate) => (
                  <SelectItem key={rate.id} value={rate.id}>
                    {rate.name} ({rate.ratePercent}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Tax Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={taxAmount === 0 ? "" : taxAmount}
              onChange={(e) => setTaxAmount(Number(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Paid Now</Label>
            <Input
              type="number"
              step="0.01"
              value={paidAmount === 0 ? "" : paidAmount}
              onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
            />
          </div>

          {showDueDate && (
            <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
              <Label>Due Date</Label>
              <Input type="date" name="dueDate" min={todayForDateInput()} />
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Notes</Label>
          <Textarea
            name="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {estimate && (
        <div className="space-y-3" data-testid="convert-exchange">
          <QuotationExchangeEstimateCard estimate={estimate} />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={exchangeConfirm}
              onChange={(e) => setExchangeConfirm(e.target.checked)}
            />
            <span>
              <span className="font-medium">Customer is handing over this old gold now</span>
              <span className="block text-xs text-muted-foreground">
                It&apos;s bought into stock and adjusted against this invoice, re-valued with today&apos;s rates.
                Untick to convert without the exchange.
              </span>
            </span>
          </label>
          {exchangeActive && exchangeSplit.excess > 0 && (
            <div className="space-y-2 rounded-md border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm">
              <p className="font-medium text-emerald-800">
                The old gold is worth ₹{exchangeSplit.excess.toFixed(2)} more than what&apos;s left on the bill. How does the
                customer want the difference?
              </p>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="exchangeExcessModeChoice"
                    checked={exchangeExcessMode === "STORE_CREDIT"}
                    onChange={() => setExchangeExcessMode("STORE_CREDIT")}
                  />
                  Keep as store credit
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="exchangeExcessModeChoice"
                    checked={exchangeExcessMode === "PAID_OUT"}
                    onChange={() => setExchangeExcessMode("PAID_OUT")}
                  />
                  Pay it out now
                </label>
              </div>
              {exchangeExcessMode === "PAID_OUT" && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Select value={exchangePayoutMethod || undefined} onValueChange={setExchangePayoutMethod}>
                    <SelectTrigger className="h-9 w-full bg-background">
                      <SelectValue placeholder="Paid by…" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYOUT_METHODS.map((method) => (
                        <SelectItem key={method.value} value={method.value}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-9 bg-background"
                    placeholder="Reference (optional)"
                    value={exchangePayoutReference}
                    onChange={(e) => setExchangePayoutReference(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-4 space-y-1 text-sm max-w-sm ml-auto">
        <div className="flex justify-between">
          <span>Subtotal + Charges</span>
          <span>₹{subtotalBeforeTax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span>₹{taxAmount.toFixed(2)}</span>
        </div>
        {Math.abs(roundedTotal - totalAmount) >= 0.005 && (
          <div className="flex justify-between">
            <span>Round Off</span>
            <span>
              {roundedTotal - totalAmount > 0 ? "+" : "-"}₹{Math.abs(roundedTotal - totalAmount).toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
          <span>Total</span>
          <span>₹{roundedTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-blue-600 font-medium">
          <span>Paid Now</span>
          <span>₹{paidAmount.toFixed(2)}</span>
        </div>
        {exchangeActive && estimate && (
          <>
            <div className="flex justify-between text-amber-700">
              <span>Less: old gold (estimate ₹{estimate.total.toFixed(2)})</span>
              <span>-₹{exchangeSplit.applied.toFixed(2)}</span>
            </div>
            {exchangeSplit.excess > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>
                  {exchangeExcessMode === "PAID_OUT" ? "Balance paid to customer" : "Balance kept as store credit"}
                </span>
                <span>₹{exchangeSplit.excess.toFixed(2)}</span>
              </div>
            )}
          </>
        )}
        <div className="flex justify-between text-red-600 font-medium">
          <span>Balance Due</span>
          <span>₹{balanceAmount.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || exchangePayoutMissing}>
          {pending ? "Converting..." : "Convert to Invoice"}
        </Button>
      </div>
    </form>
  )
}
