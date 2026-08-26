"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { User, Phone, Mail, MapPin, Hash, IndianRupee } from "lucide-react"

import { addVendor, type VendorFormState } from "@/lib/actions/vendor-actions"
import { getCitiesByStateId } from "@/lib/actions/location-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/providers/toast-provider"

type StateItem = { id: string; name: string }
type CityItem = { id: string; name: string }

const initialState: VendorFormState = { success: false, message: "", errors: {} }

const FIELD = "w-full rounded-md border bg-background px-3 py-2 text-sm"

type VendorCreateFormProps = {
  states: StateItem[]
  /**
   * Where to go after saving. Set when the user arrived from another
   * screen's "Add New Vendor" option — the new vendor's id is appended so
   * that screen can select it on arrival.
   */
  returnTo?: string
}

/**
 * Full-page vendor create form. Same fields as the Vendors page dialog
 * (components/vendors/add-vendor-dialog.tsx), on its own route so it can be
 * linked to from other flows instead of only opening as a popup.
 */
export function VendorCreateForm({ states, returnTo }: VendorCreateFormProps) {
  const router = useRouter()
  const toast = useToast()

  const [selectedStateId, setSelectedStateId] = useState("")
  const [cities, setCities] = useState<CityItem[]>([])
  const [loadingCities, setLoadingCities] = useState(false)

  const [state, formAction, pending] = useActionState(addVendor, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Vendor added successfully")

      // Hand the new id back to whoever sent us here so it can be selected
      // straight away, rather than making the user hunt for it in the list.
      if (returnTo && state.vendor) {
        const separator = returnTo.includes("?") ? "&" : "?"
        router.push(`${returnTo}${separator}newVendorId=${state.vendor.id}`)
      } else {
        router.push("/vendors")
      }

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
    <Card>
      <CardContent className="pt-6">
        <form
          action={formAction}
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4 text-muted-foreground" />
              Vendor Name <span className="text-destructive">*</span>
            </label>
            <input
              name="name"
              className={FIELD}
              placeholder="Enter vendor name"
              required
              autoFocus
            />
            {state.errors?.name?.[0] && (
              <p className="text-sm text-destructive">{state.errors.name[0]}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Phone <span className="text-destructive">*</span>
            </label>
            <input
              name="phone"
              type="tel"
              className={FIELD}
              placeholder="Enter phone number"
              required
            />
            {state.errors?.phone?.[0] && (
              <p className="text-sm text-destructive">{state.errors.phone[0]}</p>
            )}
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
              placeholder="Enter alternate phone"
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
              placeholder="Enter email address"
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Address
            </label>
            <textarea
              name="address"
              rows={2}
              className={FIELD}
              placeholder="Enter full address"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">State</label>
            <select
              name="state"
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
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">City</label>
            <select
              name="city"
              className={FIELD}
              disabled={!selectedStateId || loadingCities}
            >
              <option value="">
                {loadingCities
                  ? "Loading cities..."
                  : selectedStateId
                    ? "Select city"
                    : "Select a state first"}
              </option>
              {cities.map((city) => (
                <option key={city.id} value={city.name}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Pincode</label>
            <input name="pincode" className={FIELD} placeholder="Enter pincode" />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-muted-foreground" />
              GSTIN
            </label>
            <input name="gstNumber" className={FIELD} placeholder="Enter GSTIN" />
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
              defaultValue={0}
              className={FIELD}
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              name="notes"
              rows={2}
              className={FIELD}
              placeholder="Any notes about this vendor"
            />
          </div>

          <div className="flex justify-end gap-2 md:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save Vendor"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
