"use client"

import { useEffect, useMemo, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"

import {
  convertKachaToPakka,
  type KachaInvoiceFormState,
} from "@/lib/actions/kacha-invoice-actions"
import { useToast } from "@/components/providers/toast-provider"
import { todayForDateInput } from "@/lib/date-input"
import { computeRoundOff } from "@/lib/round-off"

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

const initialState: KachaInvoiceFormState = { success: false, message: "" }

type KachaInvoiceSummary = {
  id: string
  slipNumber: string
  subtotal: number
  makingCharges: number
  stoneCharges: number
  discount: number
  totalAmount: number
  notes: string | null
  customer: {
    name: string
    gstin: string | null
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

type ConvertToPakkaFormProps = {
  kachaInvoice: KachaInvoiceSummary
  /** The store's configured GST rates (Settings > GST Rates) — see the
   * same prop on InvoiceForm for the full explanation. */
  gstRates: GstRateRow[]
  /** Legacy last-resort fallback (BusinessSettings.defaultGstRate) — see
   * the same prop on InvoiceForm. */
  defaultGstRate: number
}

export function ConvertToPakkaForm({
  kachaInvoice,
  gstRates,
  defaultGstRate,
}: ConvertToPakkaFormProps) {
  const router = useRouter()
  const toast = useToast()

  const taxableAmount =
    kachaInvoice.subtotal +
    kachaInvoice.makingCharges +
    kachaInvoice.stoneCharges -
    kachaInvoice.discount

  const [gstRateId, setGstRateId] = useState<string>(
    () =>
      gstRates.find((r) => r.isDefault && r.isActive)?.id ??
      gstRates.find((r) => r.isActive)?.id ??
      "",
  )
  const activeGstRates = useMemo(() => gstRates.filter((r) => r.isActive), [gstRates])
  const selectedGstRate = gstRates.find((r) => r.id === gstRateId)
  // The plain percent, still fed into the same tax math as before — only
  // where the number comes from changed.
  const gstRate = selectedGstRate?.ratePercent ?? defaultGstRate
  const [notes, setNotes] = useState(kachaInvoice.notes ?? "")

  const taxAmount = useMemo(
    () => Math.round(((taxableAmount * gstRate) / 100) * 100) / 100,
    [taxableAmount, gstRate],
  )

  const rawTotal = taxableAmount + taxAmount
  // Live preview of the same server-side round-off convertKachaToPakka
  // applies to the new Invoice it creates — see lib/round-off.ts. Not
  // submitted; the server recomputes this from taxAmount/taxableAmount.
  const { roundOffAmount, totalAmount } = computeRoundOff(rawTotal)

  const convertAction = convertKachaToPakka.bind(null, kachaInvoice.id)
  const [state, formAction, pending] = useActionState(convertAction, initialState)

  useEffect(() => {
    if (state.success && state.invoiceId) {
      toast.success(state.message || "Converted to Tax Invoice")
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
      <input type="hidden" name="gstRateId" value={gstRateId} />

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">From Estimate {kachaInvoice.slipNumber}</h2>

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
              {kachaInvoice.items.map((item) => (
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
        <h2 className="text-lg font-semibold">GST Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Party GSTIN</Label>
            <Input
              defaultValue={kachaInvoice.customer?.gstin ?? ""}
              placeholder="e.g. 27ABCDE1234F1Z5"
              disabled
            />
            <p className="text-xs text-muted-foreground">
              Managed from the party&apos;s profile.
            </p>
          </div>

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>GST Rate</Label>
            <Select value={gstRateId || undefined} onValueChange={(value) => setGstRateId(value)}>
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
            <Label>Due Date</Label>
            <Input type="date" name="dueDate" min={todayForDateInput()} />
          </div>
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

      <div className="rounded-lg border bg-muted/30 p-4 space-y-1 text-sm max-w-sm ml-auto">
        <div className="flex justify-between">
          <span>Subtotal + Charges</span>
          <span>₹{taxableAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>GST ({gstRate}%)</span>
          <span>₹{taxAmount.toFixed(2)}</span>
        </div>
        {roundOffAmount !== 0 && (
          <div className="flex justify-between">
            <span>Round Off</span>
            <span>
              {roundOffAmount >= 0 ? "+" : "-"}₹{Math.abs(roundOffAmount).toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
          <span>Total</span>
          <span>₹{totalAmount.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Converting..." : "Convert to Tax Invoice"}
        </Button>
      </div>
    </form>
  )
}
