"use client"

import * as React from "react"
import { useActionState, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { addCustomer, type CustomerFormState } from "@/lib/actions/customer-actions"
import { getCitiesByStateId } from "@/lib/actions/location-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/providers/toast-provider"
import { User, Phone, Mail, MapPin, Hash, IndianRupee, Plus } from "lucide-react"

type StateItem = {
  id: string
  name: string
}

type CityItem = {
  id: string
  name: string
}

const initialState: CustomerFormState = {
  success: false,
  message: "",
  errors: {},
}

type AddCustomerDialogProps = {
  states: StateItem[]
}

export function AddCustomerDialog({ states }: AddCustomerDialogProps) {
  const router = useRouter()
  const toast = useToast()

  const formRef = useRef<HTMLFormElement>(null)

  const [open, setOpen] = useState(false)
  const [selectedStateId, setSelectedStateId] = useState("")
  const [cities, setCities] = useState<CityItem[]>([])
  const [loadingCities, setLoadingCities] = useState(false)

  const [state, formAction, pending] = useActionState(addCustomer, initialState)

  const stateNameMap = useMemo(() => {
    return new Map(states.map((item) => [item.id, item.name]))
  }, [states])

  const resetDialogState = React.useCallback(() => {
    formRef.current?.reset()
    setSelectedStateId("")
    setCities([])
  }, [])

  useEffect(() => {
    if (!open) {
      resetDialogState()
    }
  }, [open, resetDialogState])

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Customer added successfully")
      setOpen(false)
      resetDialogState()
      router.refresh()
      return
    }

    if (!state.success && state.message) {
      toast.error(state.message)
    }
  }, [state, router, toast, resetDialogState])

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

        if (!cancelled) {
          setCities(data || [])
        }
      } catch (err) {
        console.error("Failed to load cities:", err)
        if (!cancelled) {
          setCities([])
        }
      } finally {
        if (!cancelled) {
          setLoadingCities(false)
        }
      }
    }

    loadCities()

    return () => {
      cancelled = true
    }
  }, [selectedStateId])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add Customer
      </Button>

      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add Customer</DialogTitle>
        </DialogHeader>

        <form
          ref={formRef}
          action={formAction}
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4 text-gray-500" />
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input
              name="name"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Enter customer name"
              required
            />
            {state.errors?.name?.[0] && (
              <p className="text-sm text-red-600">{state.errors.name[0]}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Phone className="h-4 w-4 text-gray-500" />
              Phone <span className="text-red-500">*</span>
            </label>
            <input
              name="phone"
              type="tel"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Enter phone number"
              required
            />
            {state.errors?.phone?.[0] && (
              <p className="text-sm text-red-600">{state.errors.phone[0]}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Phone className="h-4 w-4 text-gray-500" />
              Alternate Phone
            </label>
            <input
              name="altPhone"
              type="tel"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Enter alternate phone"
            />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Mail className="h-4 w-4 text-gray-500" />
              Email
            </label>
            <input
              name="email"
              type="email"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Enter email address"
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-gray-500" />
              Address
            </label>
            <textarea
              name="address"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Enter full address"
              rows={3}
            />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-gray-500" />
              State
            </label>
            <select
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

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-gray-500" />
              City
            </label>
            <select
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

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-gray-500" />
              Pincode
            </label>
            <input
              name="pincode"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Enter pincode"
            />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-gray-500" />
              GST Number
            </label>
            <input
              name="gstNumber"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Enter GST number"
            />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <IndianRupee className="h-4 w-4 text-gray-500" />
              Opening Balance
            </label>
            <input
              name="openingBalance"
              type="number"
              step="0.01"
              defaultValue="0"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              name="notes"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Enter notes"
              rows={3}
            />
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>

            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save Customer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}