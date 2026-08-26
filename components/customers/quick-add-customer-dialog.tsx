"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { User, Phone, Mail, MapPin, Hash, IndianRupee } from "lucide-react"

import { addCustomer, type CustomerFormState } from "@/lib/actions/customer-actions"
import { getStates, getCitiesByStateId, type StateOption, type CityOption } from "@/lib/actions/location-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/providers/toast-provider"
import type { CustomerOption } from "@/components/customers/customer-select"

const initialState: CustomerFormState = {
  success: false,
  message: "",
  errors: {},
}

type QuickAddCustomerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-fills Name with whatever the user had already typed into the customer search box. */
  initialName?: string
  onCreated: (customer: CustomerOption) => void
}

/**
 * The same "create customer" fields as the full Customers page dialog
 * (components/customers/add-customer-dialog.tsx), triggered instead from
 * inside CustomerSelect's "no customers found" state, so a missing
 * customer never has to break the flow of creating an invoice/quotation/
 * kacha slip.
 */
export function QuickAddCustomerDialog({
  open,
  onOpenChange,
  initialName,
  onCreated,
}: QuickAddCustomerDialogProps) {
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState(addCustomer, initialState)

  const [states, setStates] = useState<StateOption[]>([])
  const [selectedStateId, setSelectedStateId] = useState("")
  const [cities, setCities] = useState<CityOption[]>([])
  const [loadingCities, setLoadingCities] = useState(false)

  const stateNameMap = new Map(states.map((item) => [item.id, item.name]))

  useEffect(() => {
    if (!open || states.length > 0) return

    getStates()
      .then(setStates)
      .catch((err) => console.error("Failed to load states:", err))
  }, [open, states.length])

  useEffect(() => {
    let cancelled = false

    async function loadCities() {
      if (!selectedStateId) {
        setCities([])
        return
      }

      try {
        setLoadingCities(true)
        const data = await getCitiesByStateId(selectedStateId)
        if (!cancelled) setCities(data || [])
      } catch (err) {
        console.error("Failed to load cities:", err)
        if (!cancelled) setCities([])
      } finally {
        if (!cancelled) setLoadingCities(false)
      }
    }

    loadCities()

    return () => {
      cancelled = true
    }
  }, [selectedStateId])

  function resetDialogState() {
    formRef.current?.reset()
    setSelectedStateId("")
    setCities([])
  }

  useEffect(() => {
    if (state.success && state.customer) {
      toast.success(state.message || "Customer added successfully")
      onCreated(state.customer)
      onOpenChange(false)
      resetDialogState()
      return
    }

    if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetDialogState()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create New Customer</DialogTitle>
          <DialogDescription>
            Add the full customer profile now, or fill it in later from the
            Customers page.
          </DialogDescription>
        </DialogHeader>

        <form
          ref={formRef}
          action={formAction}
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <div className="space-y-1.5">
            <Label htmlFor="quick-add-name" className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Customer Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="quick-add-name"
              name="name"
              defaultValue={initialName}
              placeholder="Enter customer name"
              required
              autoFocus
            />
            {state.errors?.name?.[0] && (
              <p className="text-sm text-red-600">{state.errors.name[0]}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-add-phone" className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Phone <span className="text-red-500">*</span>
            </Label>
            <Input
              id="quick-add-phone"
              name="phone"
              type="tel"
              placeholder="Enter phone number"
              required
            />
            {state.errors?.phone?.[0] && (
              <p className="text-sm text-red-600">{state.errors.phone[0]}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-add-alt-phone" className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Alternate Phone
            </Label>
            <Input
              id="quick-add-alt-phone"
              name="altPhone"
              type="tel"
              placeholder="Enter alternate phone"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-add-email" className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email
            </Label>
            <Input
              id="quick-add-email"
              name="email"
              type="email"
              placeholder="Enter email address"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="quick-add-address" className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Address
            </Label>
            <Textarea
              id="quick-add-address"
              name="address"
              placeholder="Enter full address"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-add-state" className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              State
            </Label>
            <select
              id="quick-add-state"
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={selectedStateId}
              onChange={(e) => setSelectedStateId(e.target.value)}
            >
              <option value="">Select state</option>
              {states.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              type="hidden"
              name="state"
              value={selectedStateId ? stateNameMap.get(selectedStateId) ?? "" : ""}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-add-city" className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              City
            </Label>
            <select
              id="quick-add-city"
              name="city"
              className="w-full rounded-md border px-3 py-2 text-sm"
              disabled={!selectedStateId || loadingCities}
              defaultValue=""
            >
              <option value="">
                {loadingCities ? "Loading cities..." : "Select city"}
              </option>
              {cities.map((city) => (
                <option key={city.id} value={city.name}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-add-pincode" className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              Pincode
            </Label>
            <Input
              id="quick-add-pincode"
              name="pincode"
              placeholder="Enter pincode"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-add-gst" className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              GST Number
            </Label>
            <Input
              id="quick-add-gst"
              name="gstNumber"
              placeholder="Enter GST number"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-add-opening-balance" className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
              Opening Balance
            </Label>
            <Input
              id="quick-add-opening-balance"
              name="openingBalance"
              type="number"
              step="0.01"
              defaultValue="0"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="quick-add-notes">Notes</Label>
            <Textarea
              id="quick-add-notes"
              name="notes"
              placeholder="Enter notes"
              rows={3}
            />
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>

            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create & Select"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
