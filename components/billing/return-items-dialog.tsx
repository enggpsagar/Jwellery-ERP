"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Undo2 } from "lucide-react"

import {
  createCreditNote,
  getReturnableInvoiceItems,
  type CreditNoteFormState,
  type ReturnableInvoiceItem,
} from "@/lib/actions/credit-note-actions"
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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const initialState: CreditNoteFormState = { success: false, message: "" }

type SelectableItem = ReturnableInvoiceItem & {
  selected: boolean
  returnQuantity: number
}

type ReturnItemsDialogProps = {
  invoiceId: string
  invoiceNumber: string
}

/**
 * Raises a Credit Note against a subset of this invoice's line items —
 * only ever rendered for a PAID/PARTIAL invoice still within the store's
 * return window (see getReturnEligibility) by the caller. Fetches
 * returnable items lazily on open rather than at page load, since a
 * merchant may never open this for most invoices.
 */
export function ReturnItemsDialog({ invoiceId, invoiceNumber }: ReturnItemsDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<SelectableItem[]>([])
  const [reason, setReason] = useState("")
  const router = useRouter()
  const toast = useToast()

  const createCreditNoteWithId = createCreditNote.bind(null, invoiceId)
  const [state, formAction, pending] = useActionState(createCreditNoteWithId, initialState)

  useEffect(() => {
    if (!open) return

    setLoading(true)
    getReturnableInvoiceItems(invoiceId)
      .then((returnable) => {
        setItems(
          (returnable ?? []).map((item) => ({
            ...item,
            selected: false,
            returnQuantity: item.returnableQuantity,
          })),
        )
      })
      .finally(() => setLoading(false))
  }, [open, invoiceId])

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Credit note created")
      setOpen(false)
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const toggleItem = (id: string, selected: boolean) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, selected } : item)))
  }

  const setReturnQuantity = (id: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, returnQuantity: Math.max(1, Math.min(quantity, item.returnableQuantity)) }
          : item,
      ),
    )
  }

  const selectedItems = items.filter((item) => item.selected)
  const refundTotal = selectedItems.reduce((sum, item) => {
    const perUnit = item.quantity > 0 ? item.lineTotal / item.quantity : 0
    return sum + perUnit * item.returnQuantity
  }, 0)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Undo2 className="h-4 w-4" />
          Return Items
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Return items from {invoiceNumber}</DialogTitle>
          <DialogDescription>
            Selected items are restored to inventory and refunded to the customer's
            ledger as a Credit Note. This can't be undone from here.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            const formData = new FormData()
            formData.set("reason", reason)
            formData.set(
              "itemsJson",
              JSON.stringify(
                selectedItems.map((item) => ({
                  invoiceItemId: item.id,
                  quantity: item.returnQuantity,
                })),
              ),
            )
            formAction(formData)
          }}
          className="space-y-4"
        >
          {!state.success && state.message && (
            <div className="text-sm text-red-600">{state.message}</div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading returnable items...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every item on this invoice has already been fully returned.
            </p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-md border p-2">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(event) => toggleItem(item.id, event.target.checked)}
                    className="h-4 w-4"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.itemName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.returnableQuantity} of {item.quantity} left to return
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={item.returnableQuantity}
                    value={item.returnQuantity}
                    disabled={!item.selected}
                    onChange={(event) => setReturnQuantity(item.id, Number(event.target.value) || 1)}
                    className="h-9 w-20"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              placeholder="Optional — why are these items being returned?"
            />
          </div>

          {selectedItems.length > 0 && (
            <p className="text-sm font-medium">
              Refund total: ₹{refundTotal.toFixed(2)}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || selectedItems.length === 0}>
              {pending ? "Processing..." : "Create Credit Note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
