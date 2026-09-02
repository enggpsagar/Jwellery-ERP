// components/customers/ledger/add-customer-refund-entry-dialog.tsx
"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { IndianRupee, NotebookText, RotateCcw, Scale } from "lucide-react"

import {
  addCustomerRefundEntry,
  type CustomerLedgerFormState,
} from "@/lib/actions/customer-ledger-actions"
import {
  classifyMetalName,
  BUSINESS_UNIT_LABELS,
  WEIGHT_BASED_UNITS,
  type BusinessUnit,
} from "@/lib/business-units"
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions"
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

type AddCustomerRefundEntryDialogProps = {
  customerId: string
  activeUnits: BusinessUnit[]
  metals: StoreMetalRow[]
}

const initialLedgerState: CustomerLedgerFormState = {
  success: false,
  message: "",
  errors: {},
}

export function AddCustomerRefundEntryDialog({
  customerId,
  activeUnits,
  metals,
}: AddCustomerRefundEntryDialogProps) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [unit, setUnit] = useState<BusinessUnit>(activeUnits[0] ?? "MONEY")

  const action = addCustomerRefundEntry.bind(null, customerId)
  const [state, formAction, pending] = useActionState(action, initialLedgerState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Refund entry added successfully")
      setOpen(false)
      return
    }

    if (!state.success && state.message) {
      toast.error(state.message)
    }
  }, [state, toast])

  const isWeightBased = WEIGHT_BASED_UNITS.includes(unit)
  // Diamond is carat-based, not a rupee value — same quantity-entry pattern
  // as Gold/Silver's weight, just labelled in carats (see business-units.ts's
  // CARAT_BASED_UNITS).
  const isCaratBased = unit === "DIAMOND"
  const isQuantityBased = isWeightBased || isCaratBased

  const matchingMetals = useMemo(
    () => metals.filter((metal) => classifyMetalName(metal.name) === unit),
    [metals, unit],
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">
        <RotateCcw className="h-4 w-4" />
        Add Refund Entry
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Refund / Payment Entry</DialogTitle>
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
            <div className="space-y-1">
              <label className="text-sm font-medium">Unit</label>
              <select
                name="unit"
                value={unit}
                onChange={(event) => setUnit(event.target.value as BusinessUnit)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                {activeUnits.map((u) => (
                  <option key={u} value={u}>
                    {BUSINESS_UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeUnits.length <= 1 && (
            <input type="hidden" name="unit" value={unit} />
          )}

          {isQuantityBased && (
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Scale className="h-4 w-4 text-muted-foreground" />
                {BUSINESS_UNIT_LABELS[unit]} Type <RequiredMark />
              </label>
              <select
                name="metalTypeId"
                className="w-full rounded-md border px-3 py-2 text-sm"
                required
              >
                <option value="">Select {BUSINESS_UNIT_LABELS[unit].toLowerCase()} type</option>
                {matchingMetals.map((metal) => (
                  <option key={metal.id} value={metal.id}>
                    {metal.name}
                  </option>
                ))}
              </select>
              {state.errors?.metalTypeId?.[0] && (
                <p className="text-sm text-red-600">{state.errors.metalTypeId[0]}</p>
              )}
            </div>
          )}

          {isQuantityBased ? (
            <div className="space-y-1">
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
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium">
                <IndianRupee className="h-4 w-4 text-muted-foreground" />
                Amount <RequiredMark />
              </label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Enter refund / payment amount"
                required
              />
              {state.errors?.amount?.[0] && (
                <p className="text-sm text-red-600">{state.errors.amount[0]}</p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <NotebookText className="h-4 w-4 text-muted-foreground" />
              Description
            </label>
            <textarea
              name="description"
              rows={4}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Example: Cash received / refund adjustment / return adjustment"
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
              {pending ? "Saving..." : "Save Refund Entry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
