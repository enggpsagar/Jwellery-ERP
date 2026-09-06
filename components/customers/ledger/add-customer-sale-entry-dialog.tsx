// components/customers/ledger/add-customer-sale-entry-dialog.tsx
"use client"

import { useActionState, useEffect, useState } from "react"
import { IndianRupee, NotebookText, ShoppingBag, Scale } from "lucide-react"

import {
  addCustomerSaleEntry,
  type CustomerLedgerFormState,
} from "@/lib/actions/customer-ledger-actions"
import { MONEY_UNIT } from "@/lib/business-units"
import type { BusinessUnitOption } from "@/lib/business-units.server"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/components/providers/toast-provider"
import { RequiredMark } from "@/components/shared/required-mark"

type AddCustomerSaleEntryDialogProps = {
  customerId: string
  /** Money plus every currently-configured metal/gemstone this store deals
   * in (see getActiveBusinessUnits) — each option already resolves to one
   * specific StoreMetal row, so picking a unit here directly picks the
   * metal type too; there's no separate nested "type" selector any more. */
  activeUnits: BusinessUnitOption[]
}

const initialLedgerState: CustomerLedgerFormState = {
  success: false,
  message: "",
  errors: {},
}

export function AddCustomerSaleEntryDialog({
  customerId,
  activeUnits,
}: AddCustomerSaleEntryDialogProps) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [unitValue, setUnitValue] = useState<string>(activeUnits[0]?.value ?? MONEY_UNIT)

  const action = addCustomerSaleEntry.bind(null, customerId)
  const [state, formAction, pending] = useActionState(action, initialLedgerState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Sale entry added successfully")
      setOpen(false)
      return
    }

    if (!state.success && state.message) {
      toast.error(state.message)
    }
  }, [state, toast])

  const unit = activeUnits.find((option) => option.value === unitValue)
  const isQuantityBased = unitValue !== MONEY_UNIT
  // A gemstone unit is carat-based, not a rupee value — same quantity-entry
  // pattern as a plain metal's weight, just labelled in carats.
  const isCaratBased = unit?.isGemstone ?? false

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
        <ShoppingBag className="h-4 w-4" />
        Add Sale Entry
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Sale Entry</DialogTitle>
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
          {activeUnits.length > 1 && (
            <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
              <label className="text-sm font-medium">Unit</label>
              <select
                name="unit"
                value={unitValue}
                onChange={(event) => setUnitValue(event.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                {activeUnits.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {state.errors?.unit?.[0] && (
                <p className="text-sm text-red-600">{state.errors.unit[0]}</p>
              )}
            </div>
          )}

          {activeUnits.length <= 1 && (
            <input type="hidden" name="unit" value={unitValue} />
          )}

          {isQuantityBased ? (
            <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Scale className="h-4 w-4 text-muted-foreground" />
                {isCaratBased ? "Carat Weight (ct)" : "Weight (grams)"} <RequiredMark />
              </label>
              <input
                name="weight"
                type="number"
                step="0.001"
                min="0"
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder={isCaratBased ? "Enter weight in carats" : "Enter weight in grams"}
                required
              />
              {state.errors?.weight?.[0] && (
                <p className="text-sm text-red-600">{state.errors.weight[0]}</p>
              )}
            </div>
          ) : (
            <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
              <label className="flex items-center gap-2 text-sm font-medium">
                <IndianRupee className="h-4 w-4 text-muted-foreground" />
                Sale Amount <RequiredMark />
              </label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Enter sale amount"
                required
              />
              {state.errors?.amount?.[0] && (
                <p className="text-sm text-red-600">{state.errors.amount[0]}</p>
              )}
            </div>
          )}

          <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
            <label className="flex items-center gap-2 text-sm font-medium">
              <NotebookText className="h-4 w-4 text-muted-foreground" />
              Description
            </label>
            <textarea
              name="description"
              rows={4}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Example: Gold chain sale / invoice note / manual sale remark"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>

            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save Sale Entry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
