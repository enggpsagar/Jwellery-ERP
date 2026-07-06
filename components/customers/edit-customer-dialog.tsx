"use client"

import * as React from "react"
import { useActionState, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  updateCustomer,
  type Customer,
  type CustomerFormState,
} from "@/lib/actions/customer-actions"
import { getCitiesByStateId } from "@/lib/actions/location-actions"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/providers/toast-provider"
import {
  User,
  Phone,
  Mail,
  MapPin,
  Hash,
  IndianRupee,
  Pencil,
} from "lucide-react"

type StateItem = {
  id: string
  name: string
}

type CityItem = {
  id: string
  name: string
}

type EditCustomerDialogProps = {
  customer: Customer
  states: StateItem[]
  children?: React.ReactNode
}

const initialState: CustomerFormState = {
  success: false,
  message: "",
  errors: {},
}

export function EditCustomerDialog({
  customer,
  states,
  children,
}: EditCustomerDialogProps) {
  const router = useRouter()
  const toast = useToast()

  const [open, setOpen] = useState(false)
  const [selectedStateId, setSelectedStateId] = useState("")
  const [cities, setCities] = useState<CityItem[]>([])
  const [loadingCities, setLoadingCities] = useState(false)

  const updateCustomerWithId = updateCustomer.bind(null, customer.id)
  const [state, formAction, pending] = useActionState(
    updateCustomerWithId,
    initialState
  )

  const stateNameMap = useMemo(() => {
    return new Map(states.map((item) => [item.id, item.name]))
  }, [states])

  useEffect(() => {
    const matchedState = states.find((s) => s.name === customer.state)
    if (matchedState) {
      setSelectedStateId(matchedState.id)
    } else {
      setSelectedStateId("")
    }
  }, [customer.state, states, open])

  useEffect(() => {
    async function loadCities() {
      if (!selectedStateId) {
        setCities([])
        return
      }

      try {
        setLoadingCities(true)
        const data = await getCitiesByStateId(selectedStateId)
        setCities(data || [])
      } catch (error) {
        console.error("Failed to load cities:", error)
        setCities([])
      } finally {
        setLoadingCities(false)
      }
    }

    if (open) {
      loadCities()
    }
  }, [selectedStateId, open])

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Customer updated successfully")
      setOpen(false)
      router.refresh()
      return
    }

    if (!state.success && state.message) {
      toast.error(state.message)
    }
  }, [state, router, toast])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-700 transition hover:bg-gray-50"
        aria-label={`Edit ${customer.name}`}
        title="Edit customer"
      >
        {children ?? <Pencil className="h-4 w-4" />}
      </DialogTrigger>

      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Name */}
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4 text-gray-500" />
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input
              name="name"
              defaultValue={customer.name}
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
            {state.errors?.name?.[0] && (
              <p className="text-sm text-red-600">{state.errors.name[0]}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Phone className="h-4 w-4 text-gray-500" />
              Phone <span className="text-red-500">*</span>
            </label>
            <input
              name="phone"
              type="tel"
              defaultValue={customer.phone ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
            {state.errors?.phone?.[0] && (
              <p className="text-sm text-red-600">{state.errors.phone[0]}</p>
            )}
          </div>

          {/* Alternate Phone */}
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Phone className="h-4 w-4 text-gray-500" />
              Alternate Phone
            </label>
            <input
              name="altPhone"
              defaultValue={customer.alternatePhone ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Mail className="h-4 w-4 text-gray-500" />
              Email
            </label>
            <input
              name="email"
              type="email"
              defaultValue={customer.email ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          {/* Address */}
          <div className="space-y-1 md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-gray-500" />
              Address
            </label>
            <textarea
              name="address"
              defaultValue={customer.addressLine1 ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
              rows={3}
            />
          </div>

          {/* State */}
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

          {/* City */}
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-gray-500" />
              City
            </label>
            <select
              name="city"
              defaultValue={customer.city ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
              disabled={!selectedStateId || loadingCities}
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

          {/* Pincode */}
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-gray-500" />
              Pincode
            </label>
            <input
              name="pincode"
              defaultValue={customer.pincode ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          {/* GST */}
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-gray-500" />
              GST Number
            </label>
            <input
              name="gstNumber"
              defaultValue={customer.gstin ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          {/* Opening Balance */}
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <IndianRupee className="h-4 w-4 text-gray-500" />
              Opening Balance
            </label>
            <input
              name="openingBalance"
              type="number"
              step="0.01"
              defaultValue={Number(customer.openingBalance ?? 0)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              name="notes"
              defaultValue={customer.notes ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
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
              {pending ? "Updating..." : "Update Customer"}
            </Button>
          </div>

          {!state.success && state.message && (
            <div className="md:col-span-2">
              <p className="text-sm text-red-600">{state.message}</p>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}