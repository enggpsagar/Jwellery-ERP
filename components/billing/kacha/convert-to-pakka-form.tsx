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
import { computeGst } from "@/lib/gst"
import type { GstScheme } from "@prisma/client"

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
    purity: string | null
    caratWeight: number | null
    makingCharge: number
    hmCharge: number
    stoneCharge: number
    /** A piece made of several metals/stones — its rows, each with its own
     * snapshotted GST rate (null → the rate picked here). */
    components?: { amount: number; gstRatePercent?: number | null }[]
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
  /** BusinessSettings.showDueDate — hides the Due Date field when off.
   * Defaults true so an existing caller not yet passing this keeps
   * showing it. */
  showDueDate?: boolean
  /** BusinessSettings.gstScheme / .state and the slip's customer state —
   * the same three inputs convertKachaToPakka feeds computeGst(), so the
   * preview's SGST+CGST vs IGST split (and Composition's zero) match. */
  gstScheme: GstScheme
  storeState: string | null
  customerState: string | null
}

type RateGroup = { ratePercent: number; sgst: number; cgst: number; igst: number }

/**
 * Mirror of convertKachaToPakka's per-item tax (lib/actions/kacha-invoice-
 * actions.ts) — keep the two in step. A single-metal item is taxed at the
 * picked rate on rate × net (carats for DIAMOND) + making + HM + stone,
 * unrounded; a multi-part item taxes each row's amount × quantity at the
 * row's own rate (fallback: the picked one) and making + HM at the picked
 * rate, each part's SGST/CGST/IGST rounded to paise. The slip-level
 * discount is not taken off the tax base — the server doesn't either.
 */
function previewTax(
  items: KachaInvoiceSummary["items"],
  pickedRate: number,
  scheme: GstScheme,
  storeState: string | null,
  customerState: string | null,
) {
  const round = (value: number) => Math.round(value * 100) / 100
  const groups = new Map<number, RateGroup>()
  let taxAmount = 0
  const add = (ratePercent: number, part: { sgst: number; cgst: number; igst: number }) => {
    const group = groups.get(ratePercent) ?? { ratePercent, sgst: 0, cgst: 0, igst: 0 }
    group.sgst += part.sgst
    group.cgst += part.cgst
    group.igst += part.igst
    groups.set(ratePercent, group)
  }
  for (const item of items) {
    const components = item.components ?? []
    if (!components.length) {
      const taxable =
        (item.rate ?? 0) * ((item.purity === "DIAMOND" ? item.caratWeight : item.netWeight) ?? 0) +
        item.makingCharge +
        item.hmCharge +
        item.stoneCharge
      const gst = computeGst(taxable, pickedRate, scheme, storeState, customerState)
      add(pickedRate, gst)
      taxAmount += gst.sgst + gst.cgst + gst.igst
      continue
    }
    const quantity = item.quantity || 1
    const parts = [
      ...components.map((row) => ({
        ratePercent: row.gstRatePercent ?? pickedRate,
        taxable: row.amount * quantity,
      })),
      { ratePercent: pickedRate, taxable: item.makingCharge + item.hmCharge },
    ]
    let sgst = 0
    let cgst = 0
    let igst = 0
    for (const part of parts) {
      const gst = computeGst(part.taxable, part.ratePercent, scheme, storeState, customerState)
      const rounded = { sgst: round(gst.sgst), cgst: round(gst.cgst), igst: round(gst.igst) }
      add(part.ratePercent, rounded)
      sgst += rounded.sgst
      cgst += rounded.cgst
      igst += rounded.igst
    }
    taxAmount += round(sgst) + round(cgst) + round(igst)
  }
  const rateGroups = [...groups.values()]
    .filter((g) => g.sgst + g.cgst + g.igst !== 0)
    .sort((a, b) => a.ratePercent - b.ratePercent)
  return { taxAmount, rateGroups }
}

export function ConvertToPakkaForm({
  kachaInvoice,
  gstRates,
  defaultGstRate,
  showDueDate = true,
  gstScheme,
  storeState,
  customerState,
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

  const { taxAmount, rateGroups } = useMemo(
    () => previewTax(kachaInvoice.items, gstRate, gstScheme, storeState, customerState),
    [kachaInvoice.items, gstRate, gstScheme, storeState, customerState],
  )
  const isComposition = gstScheme === "COMPOSITION"
  const isInterState = rateGroups.some((g) => g.igst !== 0)

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
      <input type="hidden" name="taxAmount" value={Math.round(taxAmount * 100) / 100} />
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

      <div className="rounded-lg border bg-muted/30 p-4 space-y-1 text-sm max-w-sm ml-auto">
        <div className="flex justify-between">
          <span>Subtotal + Charges</span>
          <span>₹{taxableAmount.toFixed(2)}</span>
        </div>
        {isComposition ? (
          <div className="flex justify-between">
            <span>GST (Composition scheme — none charged)</span>
            <span>₹0.00</span>
          </div>
        ) : rateGroups.length > 1 ? (
          <>
            {rateGroups.map((group) => (
              <div key={group.ratePercent} className="flex justify-between">
                <span>
                  {isInterState ? "IGST" : "GST"} {group.ratePercent}%
                  {!isInterState && (
                    <span className="text-xs text-muted-foreground">
                      {" "}(SGST ₹{group.sgst.toFixed(2)} + CGST ₹{group.cgst.toFixed(2)})
                    </span>
                  )}
                </span>
                <span>₹{(group.sgst + group.cgst + group.igst).toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between font-medium">
              <span>Total GST</span>
              <span>₹{taxAmount.toFixed(2)}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between">
            <span>
              {isInterState ? "IGST" : "GST"} ({rateGroups[0]?.ratePercent ?? gstRate}%)
              {!isInterState && rateGroups[0] && (
                <span className="text-xs text-muted-foreground">
                  {" "}(SGST ₹{rateGroups[0].sgst.toFixed(2)} + CGST ₹{rateGroups[0].cgst.toFixed(2)})
                </span>
              )}
            </span>
            <span>₹{taxAmount.toFixed(2)}</span>
          </div>
        )}
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
