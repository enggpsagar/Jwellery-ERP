"use client"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type DeliveryLocationStateOption = {
  id: string
  name: string
  isoCode: string
}

type DeliveryLocationSelectProps = {
  states: DeliveryLocationStateOption[]
  /** Current state NAME (not id) — State.name is unique per lib/actions/
   * location-actions.ts's getStates(), so it doubles as the Select's own
   * value without a separate id lookup. */
  value: string
  /** Fires with both the picked state's name and its GST state code in one
   * call, so a caller never has to separately look up the code itself. */
  onChange: (stateName: string, stateCode: string) => void
  stateFieldName?: string
  stateCodeFieldName?: string
}

/**
 * Where a sale's goods are actually being delivered — a State + its GST
 * State Code, the code auto-populating from whichever state is picked.
 * Reusable across every sales workflow that needs it (Billing today;
 * Quotations/Kacha can adopt the same component later), not hidden inside
 * any one form.
 *
 * Deliberately NOT the same field as the Party's own registered state
 * (Customer.state, shown elsewhere as the billing address) — this is
 * "where is it shipping to," which can differ for an out-of-state
 * delivery. The caller is expected to default `value` from the store's own
 * registered state (BusinessSettings.state/stateCode) and feed whatever
 * ends up selected here into computeGst() (lib/gst.ts) as the
 * counterparty state, in place of the customer's own.
 */
export function DeliveryLocationSelect({
  states,
  value,
  onChange,
  stateFieldName = "deliveryState",
  stateCodeFieldName = "deliveryStateCode",
}: DeliveryLocationSelectProps) {
  const selected = states.find((s) => s.name === value)
  const stateCode = selected?.isoCode ?? ""

  return (
    <div className="space-y-1.5">
      <input type="hidden" name={stateFieldName} value={value} />
      <input type="hidden" name={stateCodeFieldName} value={stateCode} />

      <Label>Delivery Location</Label>
      <div className="flex gap-2">
        <Select
          value={value}
          onValueChange={(name) => {
            const state = states.find((s) => s.name === name)
            onChange(name, state?.isoCode ?? "")
          }}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select state" />
          </SelectTrigger>
          <SelectContent>
            {states.map((s) => (
              <SelectItem key={s.id} value={s.name}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div
          className="flex w-16 shrink-0 items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground"
          title="GST State Code"
        >
          {stateCode || "—"}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Defaults to your store&apos;s own state — change this only when delivering to a different state.
      </p>
    </div>
  )
}
