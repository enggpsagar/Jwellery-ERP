// components/customers/ledger/add-customer-refund-entry-dialog.tsx
"use client"

import { useActionState, useEffect, useState } from "react"
import { IndianRupee, NotebookText, RotateCcw } from "lucide-react"

import {
  addCustomerRefundEntry,
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

type AddCustomerRefundEntryDialogProps = {
  customerId: string
}

const initialLedgerState: CustomerLedgerFormState = {
  success: false,
  message: "",
  errors: {},
}

export function AddCustomerRefundEntryDialog({
  customerId,
}: AddCustomerRefundEntryDialogProps) {
  const toast = useToast()
  const [open, setOpen] = useState(false)

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

        <form action={formAction} className="space-y-4">
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <IndianRupee className="h-4 w-4 text-gray-500" />
              Amount <span className="text-red-500">*</span>
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

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <NotebookText className="h-4 w-4 text-gray-500" />
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