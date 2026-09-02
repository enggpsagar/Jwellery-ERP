"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useActionState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { createPurchase, type PurchaseFormState } from "@/lib/actions/purchase-actions"
import { PURITY_SELECT_OPTIONS, stoneWeightToGrams } from "@/lib/purity"
import { useToast } from "@/components/providers/toast-provider"

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
import { Button } from "@/components/ui/button"
import { VendorSelect } from "@/components/vendors/vendor-select"
import { ProductSelect } from "@/components/inventory/shared/product-select"
import { LocationSelect } from "@/components/shared/location-select"

import { MakingChargeInput } from "@/components/shared/making-charge-input"
import { RequiredMark } from "@/components/shared/required-mark"

type VendorOption = {
  id: string
  name: string
  phone: string | null
  vendorCode: string | null
}

type ProductOption = {
  id: string
  productCode: string
  name: string
  category: string | null
  ornamentType: string | null
  metalType: { id: string; name: string } | null
  defaultPurity: string | null
  defaultMakingCharge: number | null
  defaultMakingChargeType: "FIXED" | "PERCENTAGE"
  defaultStoneCharge: number | null
  isActive: boolean
}

type LineItem = {
  key: string
  productId: string
  itemName: string
  metalTypeId: string
  purity: string
  quantity: number
  grossWeight: number
  netWeight: number
  caratWeight: number
  rate: number
  makingCharge: number
  makingChargeType: "FIXED" | "PERCENTAGE"
  stoneCharge: number
  dmoWeight: number
  stoneWeightInput: number
  stoneWeightUnit: "GRAM" | "CARAT"
  /** Once Net Weight is edited directly, the gross/dmo auto-calc stops
   * overwriting it — same override rule as the Product form. */
  netTouched: boolean
}

const PURITY_OPTIONS = PURITY_SELECT_OPTIONS

function emptyLineItem(): LineItem {
  return {
    key: crypto.randomUUID(),
    productId: "",
    itemName: "",
    metalTypeId: "",
    purity: "",
    quantity: 1,
    grossWeight: 0,
    netWeight: 0,
    caratWeight: 0,
    rate: 0,
    makingCharge: 0,
    makingChargeType: "FIXED",
    stoneCharge: 0,
    dmoWeight: 0,
    stoneWeightInput: 0,
    stoneWeightUnit: "GRAM",
    netTouched: false,
  }
}

function deriveNetWeight(grossWeight: number, stoneWeight: number, dmoWeight: number) {
  if (!grossWeight) return null
  const net = grossWeight - stoneWeight - dmoWeight
  return net >= 0 ? Number(net.toFixed(3)) : null
}

const initialState: PurchaseFormState = { success: false, message: "" }

type LocationOption = {
  id: string
  name: string
}

type PurchaseFormProps = {
  vendors: VendorOption[]
  products: ProductOption[]
  locations?: LocationOption[]
}

/**
 * Where an in-progress purchase is parked while the user is away creating a
 * vendor or product. sessionStorage (not localStorage) so it dies with the
 * tab and can never resurrect a stale purchase days later.
 */
const DRAFT_KEY = "purchase-form-draft"

const RETURN_TO = "/purchases/new"

type PurchaseDraft = {
  vendorId: string
  items: LineItem[]
  discount: number
  taxAmount: number
  paidAmount: number
  purchaseDate: string
  notes: string
  /** Which line item asked for the new product, so it lands on that row. */
  pendingProductForKey?: string
}

export function PurchaseForm({
  vendors,
  products,
  locations = [],
}: PurchaseFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()

  const formRef = useRef<HTMLFormElement>(null)

  // Both pickers keep their own selection in internal state seeded from
  // `defaultValue`, so changing that prop alone will not move them.
  // Bumping these remount keys is what makes a freshly created record show
  // up as the active selection.
  const [vendorSelectKey, setVendorSelectKey] = useState(0)
  const [productSelectKeys, setProductSelectKeys] = useState<
    Record<string, number>
  >({})

  // ProductSelect's shared ProductOption type expects metalType as a flat
  // display string, not the relation object; the full `products` array
  // (with the metal's id) is still used for applyProductToItem's lookup.
  const productSelectOptions = products.map((product) => ({
    ...product,
    metalType: product.metalType?.name ?? null,
  }))

  const [vendorId, setVendorId] = useState("")
  const [locationId, setLocationId] = useState("")
  const [items, setItems] = useState<LineItem[]>([emptyLineItem()])
  const [discount, setDiscount] = useState(0)
  const [taxAmount, setTaxAmount] = useState(0)
  const [paidAmount, setPaidAmount] = useState(0)

  const [state, formAction, pending] = useActionState(
    createPurchase,
    initialState,
  )

  useEffect(() => {
    if (state.success && state.purchaseId) {
      toast.success(state.message || "Purchase created")
      router.push(`/purchases/${state.purchaseId}`)
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  /**
   * Parks the whole in-progress purchase before we navigate off to create a
   * vendor or product. Without this, "Add New Vendor" would silently throw
   * away every line item the user had already entered.
   *
   * Purchase date and notes are uncontrolled inputs, so they are read off
   * the form element rather than from state.
   */
  const saveDraft = (pendingProductForKey?: string) => {
    const formData = formRef.current ? new FormData(formRef.current) : null

    const draft: PurchaseDraft = {
      vendorId,
      items,
      discount,
      taxAmount,
      paidAmount,
      purchaseDate: formData ? String(formData.get("purchaseDate") ?? "") : "",
      notes: formData ? String(formData.get("notes") ?? "") : "",
      pendingProductForKey,
    }

    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // A full or blocked sessionStorage shouldn't stop the user getting to
      // the create page — they just lose the draft, same as before.
    }
  }

  // Restore-on-return. Runs once: reads any parked draft, then selects the
  // record that was just created. Deliberately not dependent on
  // searchParams — re-running after the URL is cleaned would wipe edits
  // made since.
  const restoredRef = useRef(false)

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    const newVendorId = searchParams.get("newVendorId")
    const newProductId = searchParams.get("newProductId")

    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(DRAFT_KEY)
      if (raw) sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      raw = null
    }

    let draft: PurchaseDraft | null = null
    if (raw) {
      try {
        draft = JSON.parse(raw) as PurchaseDraft
      } catch {
        draft = null
      }
    }

    if (draft) {
      setVendorId(newVendorId || draft.vendorId || "")
      setDiscount(draft.discount ?? 0)
      setTaxAmount(draft.taxAmount ?? 0)
      setPaidAmount(draft.paidAmount ?? 0)

      let nextItems =
        draft.items && draft.items.length ? draft.items : [emptyLineItem()]

      // The page refetched on the way back in, so a product created a moment
      // ago is already in `products` — it only needs applying to the line
      // that went looking for it.
      if (newProductId && draft.pendingProductForKey) {
        const product = products.find((p) => p.id === newProductId)

        if (product) {
          nextItems = nextItems.map((item) =>
            item.key === draft?.pendingProductForKey
              ? {
                  ...item,
                  productId: product.id,
                  itemName: item.itemName || product.name,
                  metalTypeId: product.metalType?.id ?? "",
                  purity: product.defaultPurity ?? "",
                  makingCharge: product.defaultMakingCharge ?? 0,
                  makingChargeType: product.defaultMakingChargeType ?? "FIXED",
                  stoneCharge: product.defaultStoneCharge ?? 0,
                }
              : item,
          )
        }
      }

      setItems(nextItems)

      if (formRef.current) {
        const dateInput = formRef.current.elements.namedItem(
          "purchaseDate",
        ) as HTMLInputElement | null
        if (dateInput && draft.purchaseDate) dateInput.value = draft.purchaseDate

        const notesInput = formRef.current.elements.namedItem(
          "notes",
        ) as HTMLTextAreaElement | null
        if (notesInput && draft.notes) notesInput.value = draft.notes
      }

      // Both pickers seed their selection from `defaultValue` into internal
      // state, so a restored value only shows once they remount.
      setVendorSelectKey((key) => key + 1)
      setProductSelectKeys((prev) => {
        const next = { ...prev }
        nextItems.forEach((item) => {
          next[item.key] = (next[item.key] ?? 0) + 1
        })
        return next
      })

      toast.success("Picked up where you left off")
    } else if (newVendorId) {
      setVendorId(newVendorId)
      setVendorSelectKey((key) => key + 1)
    }

    // Strip the one-shot params via history rather than router.replace, so
    // Next doesn't re-render the route and undo what we just restored.
    if (newVendorId || newProductId) {
      window.history.replaceState({}, "", RETURN_TO)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateItem = (key: string, patch: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    )
  }

  /**
   * `justCreated` is passed by the quick-add dialog. `setProducts` has not
   * flushed yet at that point, so the `products` array still in this
   * closure does not contain the new product and the lookup below would
   * fail — clearing the selection instead of applying it.
   */
  const applyProductToItem = (
    key: string,
    productId: string,
    justCreated?: ProductOption,
  ) => {
    const product = justCreated ?? products.find((p) => p.id === productId)
    if (!product) {
      updateItem(key, { productId: "" })
      return
    }

    updateItem(key, {
      productId,
      itemName: product.name,
      metalTypeId: product.metalType?.id ?? "",
      purity: product.defaultPurity ?? "",
      makingCharge: product.defaultMakingCharge ?? 0,
      makingChargeType: product.defaultMakingChargeType ?? "FIXED",
      stoneCharge: product.defaultStoneCharge ?? 0,
    })
  }

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev))
  }

  // Diamond items price per carat, not per gram — mirrors lineQuantity in
  // purchase-actions.ts so the live-preview total here never disagrees with
  // what the server actually saves.
  const lineQuantity = (item: LineItem) =>
    item.purity === "DIAMOND" ? item.caratWeight : item.netWeight

  const lineTotal = (item: LineItem) =>
    item.rate * lineQuantity(item) + item.makingCharge + item.stoneCharge

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.rate * lineQuantity(item), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  )
  const makingChargesTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.makingCharge, 0),
    [items],
  )
  const stoneChargesTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.stoneCharge, 0),
    [items],
  )
  const totalAmount =
    subtotal + makingChargesTotal + stoneChargesTotal - discount + taxAmount
  const balanceAmount = Math.max(0, totalAmount - paidAmount)

  const itemsJson = JSON.stringify(
    items.map((item) => ({
      productId: item.productId,
      itemName: item.itemName || "Item",
      metalTypeId: item.metalTypeId || null,
      purity: item.purity || null,
      quantity: item.quantity || 1,
      grossWeight: item.grossWeight || null,
      netWeight: item.netWeight || null,
      caratWeight: item.caratWeight || null,
      rate: item.rate || null,
      makingCharge: item.makingCharge,
      makingChargeType: item.makingChargeType,
      stoneCharge: item.stoneCharge,
      dmoWeight: item.dmoWeight || null,
      stoneWeight: stoneWeightToGrams(item.stoneWeightInput, item.stoneWeightUnit) || null,
    })),
  )

  const canSubmit = vendorId && items.every((item) => item.productId)

  return (
    <form
      ref={formRef}
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
      className="space-y-6"
    >
      <input type="hidden" name="itemsJson" value={itemsJson} />
      <input type="hidden" name="discount" value={discount} />
      <input type="hidden" name="taxAmount" value={taxAmount} />
      <input type="hidden" name="paidAmount" value={paidAmount} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label>Vendor <RequiredMark /></Label>
          <VendorSelect
            key={vendorSelectKey}
            vendors={vendors}
            name="vendorId"
            defaultValue={vendorId}
            onChange={(id) => setVendorId(id)}
            addNewHref={`/vendors/new?returnTo=${encodeURIComponent(RETURN_TO)}`}
            onBeforeAddNew={() => saveDraft()}
          />
        </div>

        <div className="space-y-2">
          <Label>Purchase Date</Label>
          <Input
            type="date"
            name="purchaseDate"
            defaultValue={new Date().toISOString().slice(0, 10)}
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
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Line Items</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setItems((prev) => [...prev, emptyLineItem()])}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.key} className="rounded-lg border p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs">Product <RequiredMark /></Label>
                  <ProductSelect
                    key={productSelectKeys[item.key] ?? 0}
                    products={productSelectOptions}
                    name={`product-${item.key}`}
                    defaultValue={item.productId}
                    onChange={(productId) => applyProductToItem(item.key, productId)}
                    addNewHref={`/inventory/products/new?returnTo=${encodeURIComponent(RETURN_TO)}`}
                    onBeforeAddNew={() => saveDraft(item.key)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Item Name</Label>
                  <Input
                    value={item.itemName}
                    onChange={(e) => updateItem(item.key, { itemName: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity === 0 ? "" : item.quantity}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      updateItem(item.key, { quantity: Number(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Purity</Label>
                  <Select
                    value={item.purity}
                    onValueChange={(value) => updateItem(item.key, { purity: value })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select purity" />
                    </SelectTrigger>
                    <SelectContent>
                      {PURITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Gross Weight (g)</Label>
                  <Input
                    type="number"
                    step="0.00001"
                    value={item.grossWeight === 0 ? "" : item.grossWeight}
                    onChange={(e) => {
                      const grossWeight = Number(e.target.value) || 0
                      const stoneWeightGrams = stoneWeightToGrams(item.stoneWeightInput, item.stoneWeightUnit)
                      const derived = item.netTouched
                        ? undefined
                        : deriveNetWeight(grossWeight, stoneWeightGrams, item.dmoWeight)
                      updateItem(item.key, {
                        grossWeight,
                        ...(derived !== null && derived !== undefined
                          ? { netWeight: derived }
                          : {}),
                      })
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Net Weight (g)</Label>
                  <Input
                    type="number"
                    step="0.00001"
                    value={item.netWeight === 0 ? "" : item.netWeight}
                    onChange={(e) =>
                      updateItem(item.key, {
                        netWeight: Number(e.target.value) || 0,
                        netTouched: true,
                      })
                    }
                  />
                  {!item.netTouched && (
                    <p className="text-xs text-muted-foreground">Gross − stone − dust/other</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Net Stone Weight</Label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      step="0.00001"
                      className="flex-1"
                      value={item.stoneWeightInput === 0 ? "" : item.stoneWeightInput}
                      onChange={(e) => {
                        const stoneWeightInput = Number(e.target.value) || 0
                        const grams = stoneWeightToGrams(stoneWeightInput, item.stoneWeightUnit)
                        const derived = item.netTouched
                          ? undefined
                          : deriveNetWeight(item.grossWeight, grams, item.dmoWeight)
                        updateItem(item.key, {
                          stoneWeightInput,
                          ...(derived !== null && derived !== undefined
                            ? { netWeight: derived }
                            : {}),
                        })
                      }}
                    />
                    <Select
                      value={item.stoneWeightUnit}
                      onValueChange={(unit) => {
                        const stoneWeightUnit = unit as "GRAM" | "CARAT"
                        const grams = stoneWeightToGrams(item.stoneWeightInput, stoneWeightUnit)
                        const derived = item.netTouched
                          ? undefined
                          : deriveNetWeight(item.grossWeight, grams, item.dmoWeight)
                        updateItem(item.key, {
                          stoneWeightUnit,
                          ...(derived !== null && derived !== undefined
                            ? { netWeight: derived }
                            : {}),
                        })
                      }}
                    >
                      <SelectTrigger className="w-16">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GRAM">g</SelectItem>
                        <SelectItem value="CARAT">ct</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {item.purity === "DIAMOND" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Carat Weight (ct)</Label>
                    <Input
                      type="number"
                      step="0.001"
                      value={item.caratWeight === 0 ? "" : item.caratWeight}
                      onChange={(e) =>
                        updateItem(item.key, { caratWeight: Number(e.target.value) || 0 })
                      }
                    />
                    <p className="text-xs text-muted-foreground">Priced per carat, not per gram</p>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">Dust/Making/Other Wt (g)</Label>
                  <Input
                    type="number"
                    step="0.00001"
                    value={item.dmoWeight === 0 ? "" : item.dmoWeight}
                    onChange={(e) => {
                      const dmoWeight = Number(e.target.value) || 0
                      const stoneWeightGrams = stoneWeightToGrams(item.stoneWeightInput, item.stoneWeightUnit)
                      const derived = item.netTouched
                        ? undefined
                        : deriveNetWeight(item.grossWeight, stoneWeightGrams, dmoWeight)
                      updateItem(item.key, {
                        dmoWeight,
                        ...(derived !== null && derived !== undefined
                          ? { netWeight: derived }
                          : {}),
                      })
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Rate / g</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={item.rate === 0 ? "" : item.rate}
                    onChange={(e) =>
                      updateItem(item.key, { rate: Number(e.target.value) || 0 })
                    }
                  />
                </div>

                <MakingChargeInput
                  rate={item.rate}
                  netWeight={item.netWeight}
                  value={item.makingCharge}
                  onChange={(v) => updateItem(item.key, { makingCharge: v })}
                  chargeType={item.makingChargeType}
                  onChargeTypeChange={(t) => updateItem(item.key, { makingChargeType: t })}
                />

                <div className="space-y-1">
                  <Label className="text-xs">Stone Charge</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={item.stoneCharge === 0 ? "" : item.stoneCharge}
                    onChange={(e) =>
                      updateItem(item.key, {
                        stoneCharge: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Line Total</Label>
                  <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm font-medium">
                    ₹{lineTotal(item).toFixed(2)}
                  </div>
                </div>
              </div>

              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(item.key)}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
                >
                  <Trash2 className="h-3 w-3" /> Remove item
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Discount</Label>
          <Input
            type="number"
            step="0.01"
            value={discount === 0 ? "" : discount}
            onChange={(e) => setDiscount(Number(e.target.value) || 0)}
          />
        </div>

        <div className="space-y-2">
          <Label>Tax Amount</Label>
          <Input
            type="number"
            step="0.01"
            value={taxAmount === 0 ? "" : taxAmount}
            onChange={(e) => setTaxAmount(Number(e.target.value) || 0)}
          />
        </div>

        <div className="space-y-2">
          <Label>Paid Now</Label>
          <Input
            type="number"
            step="0.01"
            value={paidAmount === 0 ? "" : paidAmount}
            onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea name="notes" rows={2} />
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Subtotal (metal value)</span>
          <span>₹{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Making Charges</span>
          <span>₹{makingChargesTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Stone Charges</span>
          <span>₹{stoneChargesTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Discount</span>
          <span>-₹{discount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span>₹{taxAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
          <span>Total</span>
          <span>₹{totalAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-red-600 font-medium">
          <span>Balance Due</span>
          <span>₹{balanceAmount.toFixed(2)}</span>
        </div>
      </div>

      <Button type="submit" disabled={pending || !canSubmit}>
        {pending ? "Creating..." : "Create Purchase"}
      </Button>
    </form>
  )
}
