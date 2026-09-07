"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"

import { updatePurchase, type PurchaseFormState } from "@/lib/actions/purchase-actions"
import { useToast } from "@/components/providers/toast-provider"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { LocationSelect, type LocationOption } from "@/components/shared/location-select"

const initialState: PurchaseFormState = { success: false, message: "" }

type EditPurchaseDialogProps = {
  purchaseId: string
  purchaseDate: string
  vendorInvoiceNumber: string | null
  notes: string | null
  locationId: string | null
  locations: LocationOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Purchase date, vendor invoice number, store location, and notes are
 * editable here — no vendor, line items, or amounts. Same reasoning and
 * scope as EditInvoiceDialog: once stock is created and ledger entries
 * posted, changing those needs real reversal logic, not a quiet in-place
 * edit. A dialog rather than a full page (unlike Customer's Edit) because
 * four fields don't warrant one.
 */
export function EditPurchaseDialog({
  purchaseId,
  purchaseDate,
  vendorInvoiceNumber,
  notes,
  locationId,
  locations,
  open,
  onOpenChange,
}: EditPurchaseDialogProps) {
  const router = useRouter()
  const toast = useToast()

  const updatePurchaseWithId = updatePurchase.bind(null, purchaseId)
  const [state, formAction, pending] = useActionState(updatePurchaseWithId, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Purchase updated")
      onOpenChange(false)
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit Purchase
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            // Same auto-reset workaround as every other action-bound form
            // in this app — a plain action-bound form wipes uncontrolled
            // fields on settle regardless of success/failure.
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
              <Label>Purchase Date</Label>
              <Input type="date" name="purchaseDate" defaultValue={purchaseDate.slice(0, 10)} />
            </div>
            <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
              <Label>Vendor Invoice Number</Label>
              <Input
                name="vendorInvoiceNumber"
                placeholder="Vendor's own invoice/bill number"
                defaultValue={vendorInvoiceNumber ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Store Location</Label>
            <LocationSelect locations={locations} name="locationId" defaultValue={locationId ?? ""} />
          </div>

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Notes</Label>
            <Textarea name="notes" rows={3} defaultValue={notes ?? ""} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
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
