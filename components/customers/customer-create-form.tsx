"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { User, Phone, Mail, MapPin, Hash, IndianRupee } from "lucide-react"

import { addCustomer, type CustomerFormState } from "@/lib/actions/customer-actions"
import { getCitiesByStateId } from "@/lib/actions/location-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/providers/toast-provider"
import { RequiredMark } from "@/components/shared/required-mark"
import { customerGstinRequired } from "@/lib/gst"
import type { GstScheme } from "@prisma/client"

type StateItem = { id: string; name: string }
type CityItem = { id: string; name: string }

const initialState: CustomerFormState = { success: false, message: "", errors: {} }

const FIELD = "w-full rounded-md border bg-background px-3 py-2 text-sm"

type CustomerCreateFormProps = {
  states: StateItem[]
  /**
   * Where to go after saving. Set when the user arrived from another screen's
   * "Add New Customer" option — the new customer's id is appended so that
   * screen can select it on arrival.
   */
  returnTo?: string
  /** Drives whether GSTIN is required below - only a B2B (Wholesaler/
   *  Manufacturer) store needs the buyer's GSTIN for a valid tax invoice.
   *  See customerGstinRequired's own doc comment. */
  gstScheme: GstScheme
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null
  return <p className="text-sm text-destructive">{errors[0]}</p>
}

/**
 * Full-page customer create form — mirrors the vendor and product ones.
 *
 * A page rather than a dialog because this is reached mid-sale from a phone
 * at the counter: the picker that offers it lives inside a dropdown, and a
 * modal opened from inside one is fragile on touch. A page also survives the
 * keyboard opening, which a small dialog does not.
 */
export function CustomerCreateForm({ states, returnTo, gstScheme }: CustomerCreateFormProps) {
  const gstinRequired = customerGstinRequired(gstScheme)

  const router = useRouter()
  const toast = useToast()

  const [selectedStateId, setSelectedStateId] = useState("")
  const [cities, setCities] = useState<CityItem[]>([])
  const [loadingCities, setLoadingCities] = useState(false)

  const [state, formAction, pending] = useActionState(addCustomer, initialState)

  const stateNameMap = useMemo(
    () => new Map(states.map((item) => [item.id, item.name])),
    [states],
  )

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Customer added successfully")

      // Hand the new id back to whoever sent us here so it can be selected
      // straight away, rather than making the user hunt for it in the list.
      if (returnTo && state.customer) {
        const separator = returnTo.includes("?") ? "&" : "?"
        router.push(`${returnTo}${separator}newCustomerId=${state.customer.id}`)
      } else {
        router.push("/customers")
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
        <form
          onSubmit={(event) => {
            // Deliberately not `action={formAction}` directly on the form:
            // React resets a form's uncontrolled fields once an action-bound
            // submission settles, regardless of whether the action's own
            // returned state says success or failure — so a plain validation
            // error (name missing, etc) wiped every other field the user had
            // already typed. Calling the same `formAction` dispatcher by hand
            // from a prevented submit sidesteps that auto-reset while keeping
            // identical pending/error-state behavior.
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="grid gap-5 md:grid-cols-2"
        >
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4 text-muted-foreground" />
              Name <RequiredMark />
            </label>
            <input name="name" className={FIELD} placeholder="Customer name" required autoFocus />
            <FieldError errors={state.errors?.name} />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Phone <RequiredMark />
            </label>
            <input name="phone" type="tel" className={FIELD} placeholder="9876543210" required />
            <FieldError errors={state.errors?.phone} />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Alternate Phone
            </label>
            <input name="altPhone" type="tel" className={FIELD} placeholder="Optional" />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email
            </label>
            <input name="email" type="email" className={FIELD} placeholder="name@example.com" />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Address
            </label>
            <textarea name="address" className={FIELD} rows={3} placeholder="Enter full address" />
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

            {/* The action stores the name, not the id. */}
            <input
              type="hidden"
              name="state"
              value={selectedStateId ? (stateNameMap.get(selectedStateId) ?? "") : ""}
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
              <Hash className="h-4 w-4 text-muted-foreground" />
              Pincode
            </label>
            <input name="pincode" className={FIELD} placeholder="440001" />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-muted-foreground" />
              GST Number {gstinRequired ? <RequiredMark /> : null}
            </label>
            <input
              name="gstNumber"
              className={FIELD}
              placeholder={gstinRequired ? "Required for a B2B tax invoice" : "Optional"}
              required={gstinRequired}
            />
            {gstinRequired ? (
              <p className="text-xs text-muted-foreground">
                Wholesaler/Manufacturer (B2B) invoices need the buyer's GSTIN to be valid.
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-muted-foreground" />
              PAN Number
            </label>
            <input name="panNumber" className={FIELD} placeholder="Optional" />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-muted-foreground" />
              Registration / Encircle Id
            </label>
            <input name="registrationId" className={FIELD} placeholder="Optional" />
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
              placeholder="0.00"
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium">Notes</label>
            <textarea name="notes" className={FIELD} rows={2} placeholder="Anything worth remembering" />
          </div>

          <div className="flex gap-3 md:col-span-2">
            <Button type="submit" disabled={pending} size="lg">
              {pending ? "Saving..." : "Save customer"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
