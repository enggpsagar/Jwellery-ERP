"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Ban } from "lucide-react"

import { cancelInvoice, type InvoiceFormState } from "@/lib/actions/invoice-actions"
import { useToast } from "@/components/providers/toast-provider"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const initialState: InvoiceFormState = { success: false, message: "" }

type CancelInvoiceDialogProps = {
  invoiceId: string
  invoiceNumber: string
  balanceAmount: number
}

/**
 * Cancelling restores stock this invoice sold and writes off its current
 * outstanding balance via an offsetting ledger entry — see cancelInvoice
 * for exactly what that touches. Only ever rendered for DRAFT/PARTIAL
 * invoices by the caller; a PAID invoice has no Cancel button at all.
 */
export function CancelInvoiceDialog({
  invoiceId,
  invoiceNumber,
  balanceAmount,
}: CancelInvoiceDialogProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const toast = useToast()

  const cancelInvoiceWithId = cancelInvoice.bind(null, invoiceId)
  const [state, formAction, pending] = useActionState(cancelInvoiceWithId, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Invoice cancelled")
      setOpen(false)
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 text-red-600 hover:text-red-700">
          <Ban className="h-4 w-4" />
          Cancel Invoice
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancel {invoiceNumber}?</DialogTitle>
          <DialogDescription>
            Stock this invoice sold will be restored to inventory
            {balanceAmount > 0
              ? `, and the outstanding balance of ₹${balanceAmount.toFixed(2)} will be written off`
              : ""}
            . This can't be undone — to correct the invoice afterward, create a replacement
            referencing it.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          {!state.success && state.message && (
            <div className="text-red-600 text-sm">{state.message}</div>
          )}

          <div className="space-y-2">
            <Label>Cancellation Reason</Label>
            <Textarea
              name="cancellationReason"
              rows={2}
              placeholder="Optional — why is this invoice being cancelled?"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Keep Invoice
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Cancelling..." : "Cancel Invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
