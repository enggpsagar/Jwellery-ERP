"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"

import { updateInvoice, type InvoiceFormState } from "@/lib/actions/invoice-actions"
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
import { LocationSelect, type LocationOption } from "@/components/shared/location-select"

const initialState: InvoiceFormState = { success: false, message: "" }

type EditInvoiceDialogProps = {
  invoiceId: string
  invoiceDate: string
  dueDate: string | null
  notes: string | null
  locationId: string | null
  locations: LocationOption[]
}

/**
 * Only invoice date, due date, location, and notes are editable here — no
 * line items, amounts, or payments. Once stock is decremented and ledger
 * entries posted, changing those needs the same reversal logic Cancel
 * already does, not a quiet in-place edit — see cancelInvoice for the
 * real-correction path.
 */
export function EditInvoiceDialog({
  invoiceId,
  invoiceDate,
  dueDate,
  notes,
  locationId,
  locations,
}: EditInvoiceDialogProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const toast = useToast()

  const updateInvoiceWithId = updateInvoice.bind(null, invoiceId)
  const [state, formAction, pending] = useActionState(updateInvoiceWithId, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Invoice updated")
      setOpen(false)
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Invoice</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            // Same auto-reset workaround as RecordPaymentDialog — a plain
            // action-bound form wipes uncontrolled fields on settle
            // regardless of success/failure.
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="space-y-4"
        >
          {!state.success && state.message && (
            <div className="text-red-600 text-sm">{state.message}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
              <Label>Invoice Date</Label>
              <Input type="date" name="invoiceDate" defaultValue={invoiceDate.slice(0, 10)} />
            </div>
            <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
              <Label>Due Date</Label>
              <Input type="date" name="dueDate" defaultValue={dueDate?.slice(0, 10) ?? ""} />
            </div>
          </div>

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Location</Label>
            <LocationSelect locations={locations} name="locationId" defaultValue={locationId ?? ""} />
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
