// components/customers/ledger/add-customer-sale-entry-dialog.tsx
"use client"

import { useActionState, useEffect, useState } from "react"
import { IndianRupee, NotebookText, ShoppingBag } from "lucide-react"

import {
  addCustomerSaleEntry,
  type CustomerLedgerFormState,
} from "@/lib/actions/customer-ledger-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/components/providers/toast-provider"

type AddCustomerSaleEntryDialogProps = {
  customerId: string
}

const initialLedgerState: CustomerLedgerFormState = {
  success: false,
  message: "",
  errors: {},
}

export function AddCustomerSaleEntryDialog({
  customerId,
}: AddCustomerSaleEntryDialogProps) {
  const toast = useToast()
  const [open, setOpen] = useState(false)

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
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <IndianRupee className="h-4 w-4 text-gray-500" />
              Sale Amount <span className="text-red-500">*</span>
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

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <NotebookText className="h-4 w-4 text-gray-500" />
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