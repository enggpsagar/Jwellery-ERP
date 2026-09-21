"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useActionState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"

import {
  createDraftOrder,
  type DraftOrderFormState,
  type DraftOrderItemInput,
} from "@/lib/actions/draft-order-actions"
import { CustomerSelect, type CustomerOption } from "@/components/customers/customer-select"
import { LocationSelect, useShowLocationField, type LocationOption } from "@/components/shared/location-select"
import { matchLegacyPurityType } from "@/lib/purity"
import { classifyPurityFamily } from "@/lib/business-units"
import {
  getStoreMetalPurities,
  getStoreMetalOrigins,
  type StoreMetalRow,
  type StoreMetalPurityRow,
  type StoreMetalOriginRow,
} from "@/lib/actions/taxonomy-actions"
import type { PurityType } from "@prisma/client"
import { useToast } from "@/components/providers/toast-provider"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PaidNowFields } from "@/components/shared/paid-now-fields"
import type { PaymentMethodValue } from "@/components/shared/payment-method-fields"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RequiredMark } from "@/components/shared/required-mark"

const initialState: DraftOrderFormState = { success: false, message: "" }

type ItemRow = DraftOrderItemInput & {
  key: string
  // Escape hatch so the purity/metal-driven rate auto-fill (below) never
  // clobbers a rate the user typed in by hand — same "touched" idiom as
  // invoice-form.tsx's hmChargeTouched/stoneChargeTouched.
  rateTouched: boolean
  // UI-only — same two-step "pick Kind, then pick the type-appropriate
  // material" selection behavior as product-form.tsx's productKind, so the
  // "Metal / Stone" dropdown below only ever lists options matching this.
  // Never submitted (see itemsJson below): the server only needs the final
  // metalTypeId/purity/stoneTypeName, same as before this existed.
  kind: "METAL" | "STONE"
}

// `key` defaults to a fresh UUID for every "Add Item" click (client-only,
// safe to randomize), but the very first row is seeded once from
// useState's initializer, which runs during SSR *and* again on the
// client's first render — two different crypto.randomUUID() values for
// the same row caused a hydration mismatch. The initial call passes a
// fixed key instead so server and client agree.
function emptyItem(key: string = crypto.randomUUID()): ItemRow {
  return {
    key,
    itemName: "",
    metalTypeId: "",
    purity: null,
    purityLabel: null,
    stoneTypeName: null,
    quantity: 1,
    estimatedWeight: null,
    estimatedRate: null,
    designNotes: "",
    rateTouched: false,
    kind: "METAL",
  }
}

/** ₹ per gram → 2-decimal currency, blank for nothing entered yet. */
function formatEstimatedAmount(weight: number | null | undefined, rate: number | null | undefined) {
  if (!weight || !rate) return null
  return weight * rate
}

type DraftOrderFormProps = {
  customers: CustomerOption[]
  metals: StoreMetalRow[]
  locations?: LocationOption[]
  defaultLocationId?: string | null
}

/**
 * Where an in-progress draft order is parked while the user is away creating
 * a party. sessionStorage (not localStorage) so it dies with the tab and
 * can never resurrect a stale draft days later.
 */
const DRAFT_KEY = "draft-order-form-draft"

const RETURN_TO = "/orders/new"

type DraftOrderDraft = {
  customerId: string
  items: ItemRow[]
  locationId: string
  paymentRows: PaymentMethodValue[]
  expectedDate: string
  notes: string
}

export function DraftOrderForm({
  customers,
  metals,
  locations = [],
  defaultLocationId = null,
}: DraftOrderFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const [items, setItems] = useState<ItemRow[]>([emptyItem("initial")])

  const [customerId, setCustomerId] = useState("")
  // CustomerSelect/LocationSelect both seed their own selection from
  // `defaultValue` into internal state, so changing that prop alone will
  // not move them once a restored value needs to show.
  const [customerSelectKey, setCustomerSelectKey] = useState(0)
  const [locationSelectKey, setLocationSelectKey] = useState(0)

  // Real per-Metal Purity options (Settings > Taxonomy > Purities),
  // replacing the old global PURITY_SELECT_OPTIONS enum list — cached per
  // metalTypeId since several items can each have their own metal.
  const [metalPuritiesCache, setMetalPuritiesCache] = useState<Record<string, StoreMetalPurityRow[]>>({})

  const ensureMetalPurities = useCallback((metalTypeId: string) => {
    if (!metalTypeId || metalPuritiesCache[metalTypeId]) return
    getStoreMetalPurities(metalTypeId)
      .then((data) => setMetalPuritiesCache((prev) => ({ ...prev, [metalTypeId]: data })))
      .catch((err) => console.error("Failed to load purities:", err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metalPuritiesCache])

  // Stone Types (Settings > Taxonomy > Stone Types) for whichever gemstone
  // is picked as an item's own "Metal / Stone" — same cache-per-id pattern
  // as metalPuritiesCache above.
  const [stoneTypesCache, setStoneTypesCache] = useState<Record<string, StoreMetalOriginRow[]>>({})

  const ensureStoneTypes = useCallback((storeMetalId: string) => {
    if (!storeMetalId || stoneTypesCache[storeMetalId]) return
    getStoreMetalOrigins(storeMetalId)
      .then((data) => setStoneTypesCache((prev) => ({ ...prev, [storeMetalId]: data })))
      .catch((err) => console.error("Failed to load Stone Types:", err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stoneTypesCache])
  const [locationId, setLocationId] = useState(defaultLocationId ?? "")
  const [paymentRows, setPaymentRows] = useState<PaymentMethodValue[]>([])
  const showLocationField = useShowLocationField(locations.length)

  const [state, formAction, pending] = useActionState(createDraftOrder, initialState)

  useEffect(() => {
    if (state.success && state.orderId) {
      toast.success(state.message || "Draft order created")
      router.push(`/orders/${state.orderId}`)
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  /**
   * Parks the whole in-progress draft order before we navigate off to create
   * a party. Without this, "Create new party" would silently throw away
   * every requested item the user had already entered.
   *
   * Expected Date and Notes are uncontrolled inputs, so they are read off
   * the form element rather than from state.
   */
  const saveDraft = () => {
    const formData = formRef.current ? new FormData(formRef.current) : null

    const draft: DraftOrderDraft = {
      customerId,
      items,
      locationId,
      paymentRows,
      expectedDate: formData ? String(formData.get("expectedDate") ?? "") : "",
      notes: formData ? String(formData.get("notes") ?? "") : "",
    }

    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // A full or blocked sessionStorage shouldn't stop the user getting to
      // the create page — they just lose the draft, same as before.
    }
  }

  // Restore-on-return. Runs once: reads any parked draft, then selects the
  // party that was just created. Deliberately not dependent on
  // searchParams — re-running after the URL is cleaned would wipe edits
  // made since.
  const restoredRef = useRef(false)

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    const newPartyId = searchParams.get("newCustomerId")

    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(DRAFT_KEY)
      if (raw) sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      raw = null
    }

    let draft: DraftOrderDraft | null = null
    if (raw) {
      try {
        draft = JSON.parse(raw) as DraftOrderDraft
      } catch {
        draft = null
      }
    }

    if (draft) {
      setCustomerId(newPartyId || draft.customerId || "")
      setItems(draft.items && draft.items.length ? draft.items : [emptyItem()])
      setLocationId(draft.locationId ?? "")
      setPaymentRows(draft.paymentRows ?? [])

      if (formRef.current) {
        const expectedDateInput = formRef.current.elements.namedItem(
          "expectedDate",
        ) as HTMLInputElement | null
        if (expectedDateInput && draft.expectedDate) expectedDateInput.value = draft.expectedDate

        const notesInput = formRef.current.elements.namedItem(
          "notes",
        ) as HTMLTextAreaElement | null
        if (notesInput && draft.notes) notesInput.value = draft.notes
      }

      // Both pickers seed their selection from `defaultValue` into internal
      // state, so a restored value only shows once they remount.
      setCustomerSelectKey((key) => key + 1)
      setLocationSelectKey((key) => key + 1)

      toast.success("Picked up where you left off")
    } else if (newPartyId) {
      setCustomerId(newPartyId)
      setCustomerSelectKey((key) => key + 1)
    }

    // Strip the one-shot param via history rather than router.replace, so
    // Next doesn't re-render the route and undo what we just restored.
    if (newPartyId) {
      window.history.replaceState({}, "", RETURN_TO)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev))
  }

  const itemsJson = JSON.stringify(
    items.map(({ key: _key, rateTouched: _rateTouched, kind: _kind, ...rest }) => rest),
  )

  // Rough order-level total from each line's estimatedWeight × estimatedRate —
  // purely a client-side preview (matches how createDraftOrder computes its
  // own estimatedTotal server-side from the same two fields), not billed
  // amounts. Lines missing either figure just contribute 0, same as
  // formatEstimatedAmount's per-line display returning null for them.
  const estimatedOrderTotal = items.reduce(
    (sum, item) => sum + (formatEstimatedAmount(item.estimatedWeight, item.estimatedRate) ?? 0),
    0,
  )

  // Zero-amount rows (a split row opened but never filled in) are dropped
  // here rather than sent through — same convention as invoice-form.tsx's
  // own paymentsJson, matching parseOptionalPayments' server-side
  // requirement that any row it does receive have a real amount.
  const paymentsJson = JSON.stringify(
    paymentRows
      .filter((row) => row.amount > 0)
      .map((row) => ({
        method: row.method,
        amount: row.amount,
        reference: row.reference || null,
        bankName: row.bankName || null,
        attachmentUrl: row.attachmentUrl || null,
      })),
  )

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault()
        formAction(new FormData(event.currentTarget))
      }}
      className="space-y-6"
    >
      <input type="hidden" name="itemsJson" value={itemsJson} />
      <input type="hidden" name="paymentsJson" value={paymentsJson} />

      {/* Requested Items (the variable, primary work of building the order)
          gets the wider main column; Party/Order Details and Advance
          Payment — both short, mostly-fixed-height — share a narrower
          sidebar column instead of each claiming a full-width row below
          it. Single column below lg. */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:order-2 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Party &amp; Order Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <Label>
                  Party <RequiredMark />
                </Label>
                <CustomerSelect
                  key={customerSelectKey}
                  customers={customers}
                  defaultValue={customerId}
                  onChange={(id) => setCustomerId(id)}
                  onBeforeAddNew={() => saveDraft()}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Expected Date</Label>
                <Input name="expectedDate" type="date" />
              </div>
              <div className="space-y-1.5">
                {showLocationField && <Label>Location</Label>}
                <LocationSelect
                  key={locationSelectKey}
                  locations={locations}
                  name="locationId"
                  defaultValue={locationId}
                  onChange={setLocationId}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <Label>Notes</Label>
                <Textarea name="notes" rows={2} placeholder="Any general notes about this order" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Advance Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <PaidNowFields
                rows={paymentRows}
                onRowsChange={setPaymentRows}
                maxAmount={estimatedOrderTotal > 0 ? estimatedOrderTotal : undefined}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="lg:order-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>Requested Items</CardTitle>
          </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, index) => {
            const selectedMetal = metals.find((m) => m.id === item.metalTypeId)
            const estimatedAmount = formatEstimatedAmount(item.estimatedWeight, item.estimatedRate)

            return (
              <div key={item.key} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Item {index + 1}
                  </span>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(item.key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>
                      Item Name <RequiredMark />
                    </Label>
                    <Input
                      value={item.itemName}
                      onChange={(event) => updateItem(item.key, { itemName: event.target.value })}
                      placeholder="e.g. Ring, Bangle"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Kind</Label>
                    <Select
                      value={item.kind}
                      onValueChange={(value) => {
                        const kind = value as "METAL" | "STONE"
                        // Same reset-on-switch behavior as product-form.tsx's
                        // own Kind select: the previous material/purity/stone
                        // type/rate no longer apply once the item's basic
                        // kind changes, and a stuck rateTouched would
                        // silently block the new material's own auto-fill.
                        updateItem(item.key, {
                          kind,
                          metalTypeId: "",
                          purity: null,
                          purityLabel: null,
                          stoneTypeName: null,
                          estimatedRate: null,
                          rateTouched: false,
                        })
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select kind" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="METAL">Metal</SelectItem>
                        <SelectItem value="STONE">Stone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>{item.kind === "STONE" ? "Stone" : "Metal"}</Label>
                    <Select
                      value={item.metalTypeId ?? ""}
                      onValueChange={(value) => {
                        const metal = metals.find((m) => m.id === value)
                        if (metal?.isGemstone) ensureStoneTypes(value)
                        else if (metal?.hasPurity) ensureMetalPurities(value)
                        // A metal with no purity concept and no Stone Types
                        // either (hasPurity=false, isGemstone=false) has
                        // nothing else to fire an auto-fill on, so prefill
                        // from the metal's flat Selling Price right here.
                        // A gemstone instead waits for its own Stone Type
                        // pick below (StoreMetalOrigin.sellingPrice) —
                        // same "wait for the sub-level pick" pattern the
                        // Purity select already uses for a regular metal.
                        const autoRate =
                          !item.rateTouched && metal && !metal.hasPurity && !metal.isGemstone
                            ? metal.sellingPrice ?? null
                            : undefined
                        updateItem(item.key, {
                          metalTypeId: value,
                          purity: null,
                          purityLabel: null,
                          stoneTypeName: null,
                          ...(autoRate !== undefined ? { estimatedRate: autoRate } : {}),
                        })
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={item.kind === "STONE" ? "Select stone" : "Select metal"} />
                      </SelectTrigger>
                      <SelectContent>
                        {metals
                          .filter((m) => m.isActive && (item.kind === "STONE" ? m.isGemstone : !m.isGemstone))
                          .map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedMetal?.isGemstone && (
                    <div className="space-y-1.5">
                      <Label>Stone Type</Label>
                      <Select
                        value={item.stoneTypeName ?? "__none__"}
                        onValueChange={(value) => {
                          const options = stoneTypesCache[item.metalTypeId ?? ""] ?? []
                          const selected = value === "__none__" ? undefined : options.find((option) => option.name === value)
                          updateItem(item.key, {
                            stoneTypeName: value === "__none__" ? null : value,
                            // Store's configured per-Stone-Type Selling
                            // Price, falling back to the metal's own flat
                            // Selling Price — same chain the Purity select
                            // uses below. Skipped once the user has
                            // hand-edited the rate.
                            ...(!item.rateTouched
                              ? { estimatedRate: selected?.sellingPrice ?? selectedMetal?.sellingPrice ?? null }
                              : {}),
                          })
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Stone Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {(stoneTypesCache[item.metalTypeId ?? ""] ?? []).map((origin) => (
                            <SelectItem key={origin.id} value={origin.name}>
                              {origin.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {selectedMetal?.hasPurity && (
                    <div className="space-y-1.5">
                      <Label>Purity</Label>
                      <Select
                        value={(metalPuritiesCache[item.metalTypeId ?? ""] ?? []).find((option) => option.label === item.purityLabel)?.id ?? "__none__"}
                        onValueChange={(value) => {
                          const options = metalPuritiesCache[item.metalTypeId ?? ""] ?? []
                          const selected = options.find((option) => option.id === value)
                          const family = selectedMetal ? classifyPurityFamily(selectedMetal) : null
                          updateItem(item.key, {
                            purityLabel: selected?.label ?? null,
                            purity: (matchLegacyPurityType(family, selected?.label) ?? null) as DraftOrderItemInput["purity"],
                            // Store's configured per-Purity Selling Price,
                            // falling back to the metal's own flat Selling
                            // Price — same two-step chain Invoice/Kacha/
                            // Quotation already prefill rate from. Skipped
                            // once the user has hand-edited the rate so this
                            // never overwrites a deliberate override.
                            ...(!item.rateTouched
                              ? { estimatedRate: selected?.sellingPrice ?? selectedMetal?.sellingPrice ?? null }
                              : {}),
                          })
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select purity" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {(metalPuritiesCache[item.metalTypeId ?? ""] ?? []).map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(item.key, { quantity: Number(event.target.value) || 1 })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Estimated Weight (g)</Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={item.estimatedWeight ?? ""}
                      onChange={(event) =>
                        updateItem(item.key, {
                          estimatedWeight: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Estimated Rate (₹)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.estimatedRate ?? ""}
                      onChange={(event) =>
                        updateItem(item.key, {
                          estimatedRate: event.target.value ? Number(event.target.value) : null,
                          rateTouched: true,
                        })
                      }
                    />
                    {estimatedAmount !== null && (
                      <p className="text-xs text-muted-foreground">
                        Estimated amount: ₹{estimatedAmount.toFixed(2)}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Design Notes</Label>
                    <Textarea
                      rows={2}
                      value={item.designNotes ?? ""}
                      onChange={(event) =>
                        updateItem(item.key, { designNotes: event.target.value })
                      }
                      placeholder="Design description, reference image note, special instructions..."
                    />
                  </div>
                </div>
              </div>
            )
          })}

          <Button type="button" variant="ghost" onClick={addItem} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Item
          </Button>

          {estimatedOrderTotal > 0 && (
            <div className="flex justify-end border-t pt-3 text-sm">
              <span className="text-muted-foreground">Estimated Total:&nbsp;</span>
              <span className="font-medium">₹{estimatedOrderTotal.toFixed(2)}</span>
            </div>
          )}
        </CardContent>
        </Card>
      </div>

      {!state.success && state.message && (
        <div className="text-sm text-red-600">{state.message}</div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating..." : "Create Draft Order"}
        </Button>
      </div>
    </form>
  )
}
