"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"

import { updateQuotation, type QuotationFormState } from "@/lib/actions/quotation-actions"
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

const initialState: QuotationFormState = { success: false, message: "" }

type EditQuotationDialogProps = {
  quotationId: string
  quotationDate: string
  validUntil: string | null
  notes: string | null
}

/**
 * Quotation Date, Valid Until, and Notes are editable here — no customer
 * or line items, same scope as EditInvoiceDialog/EditPurchaseDialog/
 * EditDraftOrderDialog.
 */
export function EditQuotationDialog({
  quotationId,
  quotationDate,
  validUntil,
  notes,
}: EditQuotationDialogProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const toast = useToast()

  const updateQuotationWithId = updateQuotation.bind(null, quotationId)
  const [state, formAction, pending] = useActionState(updateQuotationWithId, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Quotation updated")
      setOpen(false)
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="edit" className="gap-2" title="Edit Quotation">
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Quotation</DialogTitle>
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
              <Label>Quotation Date</Label>
              <Input type="date" name="quotationDate" defaultValue={quotationDate.slice(0, 10)} />
            </div>
            <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
              <Label>Valid Until</Label>
              <Input type="date" name="validUntil" defaultValue={validUntil?.slice(0, 10) ?? ""} />
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
