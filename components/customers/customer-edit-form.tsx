"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { User, Phone, Mail, MapPin, Hash, IndianRupee } from "lucide-react"

import {
  updateCustomer,
  type Customer,
  type CustomerFormState,
} from "@/lib/actions/customer-actions"
import { getCitiesByStateId } from "@/lib/actions/location-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/providers/toast-provider"

type StateItem = { id: string; name: string }
type CityItem = { id: string; name: string }

const initialState: CustomerFormState = { success: false, message: "", errors: {} }

const FIELD = "w-full rounded-md border bg-background px-3 py-2 text-sm"

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null
  return <p className="text-sm text-destructive">{errors[0]}</p>
}

/**
 * Full-page customer edit form, replacing the dialog this used to be.
 *
 * Every field the record holds is present. That matters more here than on a
 * create form: `updateCustomer` writes what the form submits, so a field
 * left out of the markup is a field silently blanked on save.
 */
export function CustomerEditForm({
  customer,
  states,
  returnTo,
}: {
  customer: Customer
  states: StateItem[]
  returnTo?: string
}) {
  const router = useRouter()
  const toast = useToast()

  const stateNameMap = useMemo(
    () => new Map(states.map((item) => [item.id, item.name])),
    [states],
  )

  // The record stores the state's name; the picker works in ids.
  const initialStateId = useMemo(() => {
    const match = states.find(
      (item) => item.name.toLowerCase() === (customer.state ?? "").toLowerCase(),
    )
    return match?.id ?? ""
  }, [states, customer.state])

  const [selectedStateId, setSelectedStateId] = useState(initialStateId)
  const [cities, setCities] = useState<CityItem[]>([])
  const [loadingCities, setLoadingCities] = useState(false)

  const action = updateCustomer.bind(null, customer.id)
  const [state, formAction, pending] = useActionState(action, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Customer updated")
      router.push(returnTo ?? `/customers/${customer.id}`)
      router.refresh()
      return
    }

    if (!state.success && state.message) toast.error(state.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    let cancelled = false

    async function loadCities() {
      if (!selectedStateId) {
        setCities([])
        return
      }

      setLoadingCities(true)
      try {
        const result = await getCitiesByStateId(selectedStateId)
        if (!cancelled) setCities(result)
      } finally {
        if (!cancelled) setLoadingCities(false)
      }
    }

    loadCities()
    return () => {
      cancelled = true
    }
  }, [selectedStateId])

  return (
    <Card>
      <CardContent className="p-6">
        <form action={formAction} className="grid gap-5 md:grid-cols-2">
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4 text-muted-foreground" />
              Name *
            </label>
            <input
              name="name"
              className={FIELD}
              defaultValue={customer.name}
              required
              autoFocus
            />
            <FieldError errors={state.errors?.name} />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Phone
            </label>
            <input
              name="phone"
              type="tel"
              className={FIELD}
              defaultValue={customer.phone ?? ""}
            />
            <FieldError errors={state.errors?.phone} />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Alternate Phone
            </label>
            <input
              name="altPhone"
              type="tel"
              className={FIELD}
              defaultValue={customer.altPhone ?? ""}
            />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email
            </label>
            <input
              name="email"
              type="email"
              className={FIELD}
              defaultValue={customer.email ?? ""}
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Address
            </label>
            <textarea
              name="address"
              className={FIELD}
              rows={3}
              defaultValue={customer.address ?? ""}
            />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              State
            </label>
            <select
              className={FIELD}
              value={selectedStateId}
              onChange={(event) => setSelectedStateId(event.target.value)}
            >
              <option value="">Select state</option>
              {states.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>

            {/* Falls back to whatever is already on the record, so a state
                that is not in the list is kept rather than wiped on save. */}
            <input
              type="hidden"
              name="state"
              value={
                selectedStateId
                  ? (stateNameMap.get(selectedStateId) ?? "")
                  : (customer.state ?? "")
              }
            />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              City
            </label>
            <select
              name="city"
              className={FIELD}
              disabled={!selectedStateId || loadingCities}
              defaultValue={customer.city ?? ""}
              key={cities.length}
            >
              <option value="">
                {loadingCities ? "Loading cities..." : "Select city"}
              </option>

              {/* The saved city stays selectable even before the list for its
                  state has loaded, so opening the form and saving without
                  touching this does not clear it. */}
              {customer.city &&
              !cities.some((city) => city.name === customer.city) ? (
                <option value={customer.city}>{customer.city}</option>
              ) : null}

              {cities.map((city) => (
                <option key={city.id} value={city.name}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-muted-foreground" />
              Pincode
            </label>
            <input
              name="pincode"
              className={FIELD}
              defaultValue={customer.pincode ?? ""}
            />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-muted-foreground" />
              GST Number
            </label>
            <input
              name="gstNumber"
              className={FIELD}
              defaultValue={customer.gstNumber ?? ""}
            />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
              Opening Balance
            </label>
            <input
              name="openingBalance"
              type="number"
              step="0.01"
              className={FIELD}
              defaultValue={customer.openingBalance ?? 0}
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              name="notes"
              className={FIELD}
              rows={2}
              defaultValue={customer.notes ?? ""}
            />
          </div>

          <div className="flex gap-3 md:col-span-2">
            <Button type="submit" disabled={pending} size="lg">
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
