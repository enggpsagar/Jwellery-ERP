"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { User, Phone, Mail, MapPin, Hash, IndianRupee } from "lucide-react"
import type { GstScheme } from "@prisma/client"

import { addVendor, type VendorFormState } from "@/lib/actions/vendor-actions"
import { getCitiesByStateId } from "@/lib/actions/location-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/providers/toast-provider"
import { RequiredMark } from "@/components/shared/required-mark"
import { gstinRequired, defaultPartyGstType } from "@/lib/gst"
import { GstSchemeBadge } from "@/components/shared/gst-scheme-badge"
import { PartyGstTypeSelect } from "@/components/shared/party-gst-type-select"

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
  /** Sets this vendor's own initial GST type — see defaultPartyGstType's
   * doc comment in lib/gst.ts. Freely editable per vendor afterward, not a
   * store-wide restriction. */
  gstScheme: GstScheme
}

/**
 * Full-page vendor create form — the only way to add a vendor now (the
 * Vendors list's "Add Vendor" used to open this as a popup dialog; that
 * dialog is gone, this page is linked to directly instead). Also reused
 * mid-flow by other forms' "Add New Vendor" option via a `returnTo`.
 */
export function VendorCreateForm({ states, returnTo, gstScheme }: VendorCreateFormProps) {
  const [gstType, setGstType] = useState(defaultPartyGstType(gstScheme))
  const gstinRequiredNow = gstinRequired(gstScheme, gstType)

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
          onSubmit={(event) => {
            // Deliberately not `action={formAction}` directly on the form:
            // React resets a form's uncontrolled fields once an action-bound
            // submission settles, regardless of whether the action's own
            // returned state says success or failure — so a plain validation
            // error wiped every other field the user had already typed.
            // Calling the same dispatcher by hand from a prevented submit
            // sidesteps that auto-reset while keeping identical pending/error-
            // state behavior.
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4 text-muted-foreground" />
              Vendor Name <RequiredMark />
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
              Phone <RequiredMark />
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
              rows={1}
              className={`${FIELD} min-h-9 resize-y`}
              placeholder="Enter full address"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">State</label>
            {/* Selected/keyed by id (to drive the city fetch below), but the
                form field itself must submit the state's name — Vendor.state
                is a plain text column, same convention as City. */}
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
            <input
              type="hidden"
              name="state"
              value={states.find((item) => item.id === selectedStateId)?.name ?? ""}
            />
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
            <label className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-muted-foreground" />
              GSTIN {gstinRequiredNow ? <RequiredMark /> : null}
            </label>
            <GstSchemeBadge scheme={gstScheme} />
            {gstScheme !== "COMPOSITION" ? (
              <PartyGstTypeSelect value={gstType} onChange={setGstType} />
            ) : null}
            <input
              name="gstNumber"
              className={`${FIELD} md:max-w-sm`}
              placeholder={gstinRequiredNow ? "Required for a B2B tax invoice" : "Enter GSTIN"}
              required={gstinRequiredNow}
            />
            {gstinRequiredNow ? (
              <p className="text-xs text-muted-foreground">
                GSTIN is required for a valid purchase entry from this vendor.
              </p>
            ) : null}
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              name="notes"
              rows={1}
              className={`${FIELD} min-h-9 resize-y`}
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
