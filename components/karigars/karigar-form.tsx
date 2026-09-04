"use client"

import { useEffect, useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Karigar } from "@/lib/actions/karigar-actions"
import type { StoreLocationRow } from "@/lib/actions/store-location-actions"
import { getCitiesByStateId } from "@/lib/actions/location-actions"
import { LocationSelect } from "@/components/shared/location-select"
import { RequiredMark } from "@/components/shared/required-mark"

type StateItem = { id: string; name: string }
type CityItem = { id: string; name: string }

type Props = {
  pending?: boolean
  karigar?: Karigar | null
  errors?: Record<string, string[]>
  locations?: StoreLocationRow[]
  states?: StateItem[]
}

export function KarigarForm({
  pending = false,
  karigar = null,
  errors,
  locations = [],
  states = [],
}: Props) {
  const [locationId, setLocationId] = useState(karigar?.locationId ?? "")

  // Selected/keyed by id (to drive the city fetch below), but the form
  // field itself submits the state's name — Karigar.state is a plain text
  // column, same convention as Vendor/Customer's own state field.
  const initialStateId = useMemo(() => {
    const match = states.find(
      (item) => item.name.toLowerCase() === (karigar?.state ?? "").toLowerCase(),
    )
    return match?.id ?? ""
  }, [states, karigar?.state])

  const [selectedStateId, setSelectedStateId] = useState(initialStateId)
  const [cities, setCities] = useState<CityItem[]>([])
  const [loadingCities, setLoadingCities] = useState(false)
  const stateNameMap = useMemo(
    () => new Map(states.map((item) => [item.id, item.name])),
    [states],
  )

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
      } catch (error) {
        console.error("Failed to load cities:", error)
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

  return (
    <div className="space-y-6">

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="space-y-2">
          <Label>Karigar Code</Label>
          <Input
            name="code"
            placeholder="KAR001"
            defaultValue={karigar?.code}
          />
        </div>

        <div className="space-y-2">
          <Label>Name <RequiredMark /></Label>
          <Input
            name="name"
            placeholder="Karigar name"
            defaultValue={karigar?.name}
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Mobile</Label>
          <Input
            name="mobile"
            placeholder="Mobile number"
            defaultValue={karigar?.mobile}
          />
          <p className="text-xs text-muted-foreground">
            Doubles as this karigar&apos;s login — must be unique.
          </p>
          {errors?.mobile?.[0] && (
            <p className="text-xs text-red-600">{errors.mobile[0]}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>WhatsApp</Label>
          <Input
            name="whatsapp"
            placeholder="WhatsApp number"
            defaultValue={karigar?.whatsapp}
          />
        </div>

        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            name="email"
            type="email"
            defaultValue={karigar?.email}
          />
          {errors?.email?.[0] && (
            <p className="text-xs text-red-600">{errors.email[0]}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>State</Label>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
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
                : (karigar?.state ?? "")
            }
          />
        </div>

        <div className="space-y-2">
          <Label>City</Label>
          <select
            name="city"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            disabled={!selectedStateId || loadingCities}
            defaultValue={karigar?.city ?? ""}
            key={cities.length}
          >
            <option value="">
              {loadingCities ? "Loading cities..." : "Select city"}
            </option>

            {/* The saved city stays selectable even before the list for its
                state has loaded, so opening the form and saving without
                touching this does not clear it. */}
            {karigar?.city && !cities.some((city) => city.name === karigar.city) ? (
              <option value={karigar.city}>{karigar.city}</option>
            ) : null}

            {cities.map((city) => (
              <option key={city.id} value={city.name}>
                {city.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>Pincode</Label>
          <Input
            name="pincode"
            defaultValue={karigar?.pincode}
          />
        </div>

        <div className="space-y-2">
          <Label>Specialization</Label>
          <Input
            name="specialization"
            placeholder="e.g. Chain making, Stone setting"
            defaultValue={karigar?.specialization}
          />
        </div>

        <div className="space-y-2">
          <Label>Location</Label>
          <LocationSelect
            locations={locations}
            name="locationId"
            defaultValue={locationId}
            onChange={setLocationId}
          />
          {errors?.locationId?.[0] && (
            <p className="text-xs text-red-600">{errors.locationId[0]}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>GST Number</Label>
          <Input
            name="gstNumber"
            defaultValue={karigar?.gstNumber}
          />
        </div>

        <div className="space-y-2">
          <Label>PAN Number</Label>
          <Input
            name="panNumber"
            defaultValue={karigar?.panNumber}
          />
        </div>

        <div className="space-y-2">
          <Label>Aadhaar Number</Label>
          <Input
            name="aadhaarNumber"
            defaultValue={karigar?.aadhaarNumber}
          />
        </div>

      </div>

      <div className="space-y-2">
        <Label>Address</Label>
        <Textarea
          name="address"
          rows={3}
          defaultValue={karigar?.address}
        />
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          name="notes"
          rows={2}
          defaultValue={karigar?.notes}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="space-y-2">
          <Label>Opening Gold (grams)</Label>
          <Input
            name="openingGold"
            type="number"
            step="0.001"
            defaultValue={karigar?.openingGold ?? 0}
          />
        </div>

        <div className="space-y-2">
          <Label>Opening Cash</Label>
          <Input
            name="openingCash"
            type="number"
            step="0.01"
            defaultValue={karigar?.openingCash ?? 0}
          />
        </div>

      </div>

      {karigar ? (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isActive"
            name="isActive"
            defaultChecked={karigar.isActive}
            className="h-4 w-4"
          />
          <Label htmlFor="isActive">Active</Label>
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2 rounded-md bg-primary text-primary-foreground"
        >
          {pending ? "Saving..." : karigar ? "Update Karigar" : "Save Karigar"}
        </button>
      </div>

    </div>
  )
}
