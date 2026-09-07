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

const TRANSPORT_MODE_OPTIONS = [
  { value: "ROAD", label: "Road" },
  { value: "RAIL", label: "Rail" },
  { value: "AIR", label: "Air" },
  { value: "SHIP", label: "Ship" },
] as const

type EditInvoiceDialogProps = {
  invoiceId: string
  invoiceDate: string
  dueDate: string | null
  notes: string | null
  locationId: string | null
  locations: LocationOption[]
  ewayBillNumber?: string | null
  ewayBillDate?: string | null
  transporterName?: string | null
  vehicleNumber?: string | null
  transportMode?: string | null
  distanceKm?: number | null
}

/**
 * Invoice date, due date, location, notes, and E-way Bill details are
 * editable here — no line items, amounts, or payments. Once stock is
 * decremented and ledger entries posted, changing those needs the same
 * reversal logic Cancel already does, not a quiet in-place edit — see
 * cancelInvoice for the real-correction path.
 *
 * E-way Bill fields are record-keeping only — this app never calls the
 * government's E-way Bill API. The store generates the actual bill on
 * ewaybillgst.gov.in and enters its number back here so it prints on the
 * invoice. Available regardless of payment status (DRAFT/PARTIAL/PAID),
 * since a bill is usually generated at dispatch, not necessarily at the
 * moment the invoice itself was raised.
 */
export function EditInvoiceDialog({
  invoiceId,
  invoiceDate,
  dueDate,
  notes,
  locationId,
  locations,
  ewayBillNumber,
  ewayBillDate,
  transporterName,
  vehicleNumber,
  transportMode,
  distanceKm,
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
        <Button
          className="gap-2 bg-[var(--chart-4)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-4)_88%,black)]"
          title="Edit Date & E-way Bill"
        >
          <Pencil className="h-4 w-4" />
          E-way Bill
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
            <Label>Store Location</Label>
            <LocationSelect locations={locations} name="locationId" defaultValue={locationId ?? ""} />
          </div>

          <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <Label>Notes</Label>
            <Textarea name="notes" rows={3} defaultValue={notes ?? ""} />
          </div>

          <div className="space-y-3 rounded-lg border border-dashed p-3">
            <div>
              <p className="text-sm font-medium">E-way Bill</p>
              <p className="text-xs text-muted-foreground">
                Generate the actual bill on ewaybillgst.gov.in, then enter its
                details here so they print on this invoice.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
                <Label>E-way Bill Number</Label>
                <Input name="ewayBillNumber" placeholder="Optional" defaultValue={ewayBillNumber ?? ""} />
              </div>
              <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
                <Label>E-way Bill Date</Label>
                <Input type="date" name="ewayBillDate" defaultValue={ewayBillDate?.slice(0, 10) ?? ""} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
                <Label>Transporter Name</Label>
                <Input name="transporterName" placeholder="Optional" defaultValue={transporterName ?? ""} />
              </div>
              <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
                <Label>Vehicle Number</Label>
                <Input name="vehicleNumber" placeholder="e.g. MH12AB1234" defaultValue={vehicleNumber ?? ""} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
                <Label>Transport Mode</Label>
                <select
                  name="transportMode"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={transportMode ?? ""}
                >
                  <option value="">Select mode</option>
                  {TRANSPORT_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
                <Label>Distance (km)</Label>
                <Input
                  type="number"
                  min={0}
                  name="distanceKm"
                  placeholder="Optional"
                  defaultValue={distanceKm ?? ""}
                />
              </div>
            </div>
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
