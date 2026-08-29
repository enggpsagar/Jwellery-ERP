// components/customers/ledger/add-customer-sale-entry-dialog.tsx
"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { IndianRupee, NotebookText, ShoppingBag, Scale } from "lucide-react"

import {
  addCustomerSaleEntry,
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

type AddCustomerSaleEntryDialogProps = {
  customerId: string
  activeUnits: BusinessUnit[]
  metals: StoreMetalRow[]
}

const initialLedgerState: CustomerLedgerFormState = {
  success: false,
  message: "",
  errors: {},
}

export function AddCustomerSaleEntryDialog({
  customerId,
  activeUnits,
  metals,
}: AddCustomerSaleEntryDialogProps) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [unit, setUnit] = useState<BusinessUnit>(activeUnits[0] ?? "MONEY")

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

  const isWeightBased = WEIGHT_BASED_UNITS.includes(unit)

  const matchingMetals = useMemo(
    () => metals.filter((metal) => classifyMetalName(metal.name) === unit),
    [metals, unit],
  )

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

        <form action={formAction} className="space-y-4">
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

          {(unit === "DIAMOND" || isWeightBased) && (
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

          {isWeightBased ? (
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Scale className="h-4 w-4 text-muted-foreground" />
                Weight (grams) <RequiredMark />
              </label>
              <input
                name="weight"
                type="number"
                step="0.001"
                min="0"
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Enter weight in grams"
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

          <div className="space-y-1">
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
