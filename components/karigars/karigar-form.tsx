"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Camera } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader } from "@/components/ui/loader"
import type { Karigar } from "@/lib/actions/karigar-actions"
import type { StoreLocationRow } from "@/lib/actions/store-location-actions"
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions"
import { getCitiesByStateId } from "@/lib/actions/location-actions"
import { LocationSelect } from "@/components/shared/location-select"
import { RequiredMark } from "@/components/shared/required-mark"
import { gstinRequired, defaultPartyGstType } from "@/lib/gst"
import { GstSchemeBadge } from "@/components/shared/gst-scheme-badge"
import { PartyGstTypeSelect } from "@/components/shared/party-gst-type-select"
import { AddMetalInlineDialog } from "@/components/karigars/add-metal-inline-dialog"
import { useToast } from "@/components/providers/toast-provider"
import type { GstScheme } from "@prisma/client"

type StateItem = { id: string; name: string }
type CityItem = { id: string; name: string }

type Props = {
  pending?: boolean
  karigar?: Karigar | null
  errors?: Record<string, string[]>
  locations?: StoreLocationRow[]
  states?: StateItem[]
  metals?: StoreMetalRow[]
  /** Store's default location — only ever used to pre-fill the Location
   * field on the create path (`karigar` null). The edit path always keeps
   * showing the karigar's own saved `locationId`, untouched. */
  defaultLocationId?: string | null
  /** The store's own State/City (Settings > Business Profile) — same
   * create-only pre-fill rule as defaultLocationId above. */
  defaultState?: string
  defaultCity?: string
  /** The store's own GST scheme (Settings > Business Profile) — same prop
   * Customer/Vendor forms take, driving gstinRequired/defaultPartyGstType
   * for this karigar's own GST registration below. */
  gstScheme: GstScheme
}

export function KarigarForm({
  pending = false,
  karigar = null,
  errors,
  locations = [],
  states = [],
  metals = [],
  defaultLocationId = null,
  defaultState,
  defaultCity,
  gstScheme,
}: Props) {
  const toast = useToast()
  const [imageUrl, setImageUrl] = useState(karigar?.imageUrl ?? "")
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  async function handlePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file")
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Photo must be under 2MB")
      return
    }

    const uploadData = new FormData()
    uploadData.append("file", file)

    setUploadingPhoto(true)
    try {
      const res = await fetch("/api/karigars/photo", { method: "POST", body: uploadData })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || "Upload failed")

      setImageUrl(data.url)
      toast.success("Photo uploaded")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setUploadingPhoto(false)
      if (photoInputRef.current) photoInputRef.current.value = ""
    }
  }

  const [locationId, setLocationId] = useState(karigar?.locationId ?? defaultLocationId ?? "")
  const [assignedMetalTypeIds, setAssignedMetalTypeIds] = useState<string[]>(
    karigar?.assignedMetalTypeIds ?? [],
  )
  // Local copy so a metal/stone created on the spot via AddMetalInlineDialog
  // shows up in the checkbox list immediately, without waiting on a
  // server round-trip/page refresh to re-fetch the store's full list.
  const [metalOptions, setMetalOptions] = useState<StoreMetalRow[]>(metals)
  const activeMetalOptions = useMemo(
    () => metalOptions.filter((m) => m.isActive),
    [metalOptions],
  )
  // Split into two independent checkbox groups — Metals and Stones read as
  // two different concerns to a store, and cramming both into one list left
  // the box's own width mostly blank once a store only has a couple of each.
  const activeMetalsOnly = useMemo(
    () => activeMetalOptions.filter((m) => !m.isGemstone),
    [activeMetalOptions],
  )
  const activeStonesOnly = useMemo(
    () => activeMetalOptions.filter((m) => m.isGemstone),
    [activeMetalOptions],
  )
  const allMetalsSelected =
    activeMetalsOnly.length > 0 &&
    activeMetalsOnly.every((m) => assignedMetalTypeIds.includes(m.id))
  const allStonesSelected =
    activeStonesOnly.length > 0 &&
    activeStonesOnly.every((m) => assignedMetalTypeIds.includes(m.id))

  function toggleSelectAllGroup(group: StoreMetalRow[], allSelected: boolean) {
    const groupIds = group.map((m) => m.id)
    setAssignedMetalTypeIds((current) =>
      allSelected
        ? current.filter((id) => !groupIds.includes(id))
        : Array.from(new Set([...current, ...groupIds])),
    )
  }

  const [gstType, setGstType] = useState(karigar?.gstType ?? defaultPartyGstType(gstScheme))
  const gstinRequiredNow = gstinRequired(gstScheme, gstType)

  function toggleAssignedMetal(metalId: string, checked: boolean) {
    setAssignedMetalTypeIds((current) =>
      checked ? [...current, metalId] : current.filter((id) => id !== metalId),
    )
  }

  // Selected/keyed by id (to drive the city fetch below), but the form
  // field itself submits the state's name — Karigar.state is a plain text
  // column, same convention as Vendor/Customer's own state field.
  const initialStateId = useMemo(() => {
    const match = states.find(
      (item) => item.name.toLowerCase() === (karigar?.state ?? defaultState ?? "").toLowerCase(),
    )
    return match?.id ?? ""
  }, [states, karigar?.state, defaultState])

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

      <input type="hidden" name="imageUrl" value={imageUrl} />

      <div className="flex flex-col items-center gap-3">
        <Avatar className="h-24 w-24 border-4 shadow-sm">
          <AvatarImage src={imageUrl || ""} />
          <AvatarFallback className="text-2xl">
            {karigar?.name ? karigar.name.charAt(0).toUpperCase() : "A"}
          </AvatarFallback>
        </Avatar>

        <input
          ref={photoInputRef}
          hidden
          type="file"
          accept="image/*"
          onChange={handlePhotoUpload}
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploadingPhoto}
          onClick={() => photoInputRef.current?.click()}
        >
          {uploadingPhoto ? (
            <Loader className="mr-2 h-4 w-4" />
          ) : (
            <Camera className="mr-2 h-4 w-4" />
          )}
          {uploadingPhoto ? "Uploading..." : "Upload Photo"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="space-y-2 rounded-lg border bg-muted/20 p-4 transition-colors focus-within:bg-accent/40 md:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <Label>
              GST Number {gstinRequiredNow ? <RequiredMark /> : null}
              <GstSchemeBadge scheme={gstScheme} />
            </Label>
            {gstScheme !== "COMPOSITION" ? (
              <PartyGstTypeSelect value={gstType} onChange={setGstType} name="gstType" />
            ) : null}
          </div>
          <Input
            name="gstNumber"
            defaultValue={karigar?.gstNumber}
            placeholder={gstinRequiredNow ? "Required for this registration type" : "Optional"}
            required={gstinRequiredNow}
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Artisan Code</Label>
          {karigar ? (
            <Input value={karigar.code} disabled readOnly />
          ) : (
            <p className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
              Auto-generated on save
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            System-generated and unique — cannot be edited.
          </p>
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Name <RequiredMark /></Label>
          <Input
            name="name"
            placeholder="Artisan name"
            defaultValue={karigar?.name}
            required
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Mobile</Label>
          <Input
            name="mobile"
            placeholder="Mobile number"
            defaultValue={karigar?.mobile}
          />
          <p className="text-xs font-medium text-red-600">
            Doubles as this artisan&apos;s login — must be unique.
          </p>
          {errors?.mobile?.[0] && (
            <p className="text-xs text-red-600">{errors.mobile[0]}</p>
          )}
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>WhatsApp</Label>
          <Input
            name="whatsapp"
            placeholder="WhatsApp number"
            defaultValue={karigar?.whatsapp}
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
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

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>City</Label>
          <select
            name="city"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            disabled={!selectedStateId || loadingCities}
            defaultValue={karigar?.city ?? defaultCity ?? ""}
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

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Pincode</Label>
          <Input
            name="pincode"
            defaultValue={karigar?.pincode}
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
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

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Specialization</Label>
          <Input
            name="specialization"
            placeholder="e.g. Chain making, Stone setting"
            defaultValue={karigar?.specialization}
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Metal Type</Label>
          <select
            name="metalTypeId"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            defaultValue={karigar?.metalTypeId ?? ""}
          >
            <option value="">Select metal (optional)</option>
            {metalOptions.map((metal) => (
              <option key={metal.id} value={metal.id}>
                {metal.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            What this artisan mainly works with — drives the Artisans list&apos;s
            Type filter.
          </p>
          {errors?.metalTypeId?.[0] && (
            <p className="text-xs text-red-600">{errors.metalTypeId[0]}</p>
          )}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>Assigned Metals &amp; Stones</Label>
          <p className="text-xs text-muted-foreground">
            Which metals or stones this artisan can be issued material in — Issue
            Material and Receive Material only ever offer these.
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-3 transition-colors focus-within:bg-accent/40">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Metals</Label>
                <AddMetalInlineDialog
                  category="metal"
                  triggerLabel="Add Metal"
                  onCreated={(metal) => {
                    setMetalOptions((current) => [...current, metal])
                    setAssignedMetalTypeIds((current) => [...current, metal.id])
                  }}
                />
              </div>
              {activeMetalsOnly.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No active metals configured yet.
                </p>
              ) : (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 border-b pb-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={allMetalsSelected}
                      onChange={() => toggleSelectAllGroup(activeMetalsOnly, allMetalsSelected)}
                      className="h-4 w-4"
                    />
                    Select All
                  </label>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {activeMetalsOnly.map((metal) => (
                      <label key={metal.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="assignedMetalTypeIds"
                          value={metal.id}
                          checked={assignedMetalTypeIds.includes(metal.id)}
                          onChange={(e) => toggleAssignedMetal(metal.id, e.target.checked)}
                          className="h-4 w-4"
                        />
                        {metal.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-lg border p-3 transition-colors focus-within:bg-accent/40">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Stones</Label>
                <AddMetalInlineDialog
                  category="stone"
                  triggerLabel="Add Stone"
                  onCreated={(metal) => {
                    setMetalOptions((current) => [...current, metal])
                    setAssignedMetalTypeIds((current) => [...current, metal.id])
                  }}
                />
              </div>
              {activeStonesOnly.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No active stones configured yet.
                </p>
              ) : (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 border-b pb-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={allStonesSelected}
                      onChange={() => toggleSelectAllGroup(activeStonesOnly, allStonesSelected)}
                      className="h-4 w-4"
                    />
                    Select All
                  </label>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {activeStonesOnly.map((metal) => (
                      <label key={metal.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="assignedMetalTypeIds"
                          value={metal.id}
                          checked={assignedMetalTypeIds.includes(metal.id)}
                          onChange={(e) => toggleAssignedMetal(metal.id, e.target.checked)}
                          className="h-4 w-4"
                        />
                        {metal.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {errors?.assignedMetalTypeIds?.[0] && (
            <p className="text-xs text-red-600">{errors.assignedMetalTypeIds[0]}</p>
          )}
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Store Location</Label>
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

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>PAN Number</Label>
          <Input
            name="panNumber"
            defaultValue={karigar?.panNumber}
            placeholder="Optional"
          />
          {errors?.panNumber?.[0] && (
            <p className="text-xs text-red-600">{errors.panNumber[0]}</p>
          )}
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Aadhaar Number</Label>
          <Input
            name="aadhaarNumber"
            defaultValue={karigar?.aadhaarNumber}
            placeholder="Optional — 12 digits"
          />
          {errors?.aadhaarNumber?.[0] && (
            <p className="text-xs text-red-600">{errors.aadhaarNumber[0]}</p>
          )}
        </div>

      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Address</Label>
          <Textarea
            name="address"
            rows={4}
            defaultValue={karigar?.address}
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Notes</Label>
          <Textarea
            name="notes"
            rows={4}
            defaultValue={karigar?.notes}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Opening Gold (grams)</Label>
          <Input
            name="openingGold"
            type="number"
            step="0.001"
            defaultValue={karigar?.openingGold ?? 0}
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
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
          {pending ? "Saving..." : karigar ? "Update Artisan" : "Save Artisan"}
        </button>
      </div>

    </div>
  )
}
