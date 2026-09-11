"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"

import { updateDraftOrder, type DraftOrderFormState } from "@/lib/actions/draft-order-actions"
import { useToast } from "@/components/providers/toast-provider"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const initialState: DraftOrderFormState = { success: false, message: "" }

type EditDraftOrderDialogProps = {
  orderId: string
  orderDate: string
  expectedDate: string | null
  notes: string | null
}

/**
 * Order Date, Expected Date, and Notes are editable here — no customer or
 * items. Same scope/reasoning as EditInvoiceDialog/EditPurchaseDialog: an
 * order's items are what the send-to-artisan flow is built around, so
 * changing them needs the real create flow, not a quiet in-place edit.
 */
export function EditDraftOrderDialog({
  orderId,
  orderDate,
  expectedDate,
  notes,
}: EditDraftOrderDialogProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const toast = useToast()

  const updateOrderWithId = updateDraftOrder.bind(null, orderId)
  const [state, formAction, pending] = useActionState(updateOrderWithId, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Order updated")
      setOpen(false)
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 border-transparent bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
          title="Edit Order"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Draft Order</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          {!state.success && state.message && (
            <div className="text-sm text-red-600">{state.message}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
              <Label>Order Date</Label>
              <Input type="date" name="orderDate" defaultValue={orderDate.slice(0, 10)} />
            </div>
            <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
              <Label>Expected Date</Label>
              <Input type="date" name="expectedDate" defaultValue={expectedDate?.slice(0, 10) ?? ""} />
            </div>
          </div>

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Notes</Label>
            <Textarea name="notes" rows={3} defaultValue={notes ?? ""} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
