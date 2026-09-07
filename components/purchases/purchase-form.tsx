"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useActionState } from "react"
import { Plus, Trash2, ChevronDown, ChevronRight, Search } from "lucide-react"
import type { PartyGstType, PurityType } from "@prisma/client"

import { createPurchase, type PurchaseFormState } from "@/lib/actions/purchase-actions"
import { PURITY_SELECT_OPTIONS, isCaratWeighedMetal, resolveGramsPerCarat, toPrimaryUnit } from "@/lib/purity"
import { useToast } from "@/components/providers/toast-provider"
import { computePurchaseGst, isVendorGstApplicable, partyGstTypeLabel } from "@/lib/gst"

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
import { PercentOrFlatInput } from "@/components/shared/percent-or-flat-input"
import { RequiredMark } from "@/components/shared/required-mark"
import { PaidNowFields } from "@/components/shared/paid-now-fields"
import type { PaymentMethodValue } from "@/components/shared/payment-method-fields"
import type { StoreMetalRow, StoreMetalOriginRow } from "@/lib/actions/taxonomy-actions"
import type { GstRateRow } from "@/lib/actions/gst-rate-actions"
import { StoneComponentFields } from "@/components/inventory/shared/stone-component-fields"
import { IncludesStoneToggle } from "@/components/ui/includes-stone-toggle"

type VendorOption = {
  id: string
  name: string
  phone: string | null
  vendorCode: string | null
  state: string | null
  gstType: PartyGstType
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
  hasStoneComponent: boolean
  defaultStoneRate: number | null
  defaultCaratWeight: number | null
  defaultStoneMetalTypeName: string | null
  defaultStoneTypeNames: string | null
  hsnCode: string | null
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
  /** Always in grams internally, regardless of grossWeightUnit — that unit
   * only picks what's displayed/typed (converted via toPrimaryUnit on the
   * way in and out) and what unit this line's weights are persisted in at
   * submit. Same convention for netWeight/dmoWeight/stoneWeightInput below. */
  grossWeightUnit: "GRAM" | "CARAT"
  netWeight: number
  netWeightUnit: "GRAM" | "CARAT"
  caratWeight: number
  rate: number
  makingCharge: number
  makingChargeType: "FIXED" | "PERCENTAGE"
  stoneCharge: number
  stoneRate: number
  hasStoneComponent: boolean
  stoneChargeTouched: boolean
  /** Once Net Stone Weight is edited directly, the Stone Carat Weight ->
   * Net Stone Weight auto-fill (see handleCaratWeightChange) stops
   * overwriting it — same escape hatch as stoneChargeTouched. */
  netStoneWeightTouched: boolean
  stoneMetalTypeName: string
  stoneTypeNames: string[]
  dmoWeight: number
  dmoWeightUnit: "GRAM" | "CARAT"
  /** Always in grams internally — see grossWeightUnit's doc comment above. */
  stoneWeightInput: number
  stoneWeightUnit: "GRAM" | "CARAT"
  hsnCode: string
  /** Once Net Weight is edited directly, the gross/dmo auto-calc stops
   * overwriting it — same override rule as the Product form. */
  netTouched: boolean
  /** Which configured GstRate (Settings > GST Rates) THIS line uses — GST
   * is picked per line, not once for the whole purchase, since a vendor's
   * single bill can genuinely mix rates across items. Mirrors
   * InvoiceItem.gstRateId's own doc comment in schema.prisma. */
  gstRateId: string
  /** Tracks whether this line has explicitly gone through the Product
   * picker's choice — either a real product was picked, or "Enter
   * Manually (No Product)" was chosen. False only for a freshly-added,
   * untouched blank row. Required at submit, mirroring Invoice's
   * stockLinkDecided: an undecided row is ambiguous (forgot to pick one?
   * meant to skip it?), so the picker's own escape hatch has to be an
   * explicit choice, not just "leave it blank." A skipped line still needs
   * a real Product row under the hood (InventoryStock/PurchaseItem's
   * productId is a hard FK) — resolved server-side to one lazily-created
   * placeholder per store, see resolveManualEntryProductId in
   * purchase-actions.ts. */
  productLinkDecided: boolean
}

const PURITY_OPTIONS = PURITY_SELECT_OPTIONS

// `key` defaults to a fresh UUID for every "Add Item" click (client-only,
// safe to randomize), but the very first row is seeded once from
// useState's initializer, which runs during SSR *and* again on the
// client's first render — two different crypto.randomUUID() values for
// the same row caused a hydration mismatch on every line-item form. The
// initial call passes a fixed key instead so server and client agree.
function emptyLineItem(defaultGstRateId?: string, key: string = crypto.randomUUID()): LineItem {
  return {
    key,
    productId: "",
    itemName: "",
    metalTypeId: "",
    purity: "",
    quantity: 1,
    grossWeight: 0,
    grossWeightUnit: "GRAM",
    netWeight: 0,
    netWeightUnit: "GRAM",
    caratWeight: 0,
    rate: 0,
    makingCharge: 0,
    makingChargeType: "FIXED",
    stoneCharge: 0,
    stoneRate: 0,
    hasStoneComponent: false,
    stoneChargeTouched: false,
    netStoneWeightTouched: false,
    stoneMetalTypeName: "",
    stoneTypeNames: [],
    // Dust/Making/Other Wt has no input anywhere on this form anymore (see
    // the removed field's own note further down) — kept here at a fixed 0
    // purely because deriveNetWeight's signature and the persisted
    // PurchaseItem/InventoryStock columns still expect a value, same as
    // InvoiceItem.dmoWeight's own now-vestigial field.
    dmoWeight: 0,
    dmoWeightUnit: "GRAM",
    stoneWeightInput: 0,
    stoneWeightUnit: "GRAM",
    hsnCode: "",
    netTouched: false,
    gstRateId: defaultGstRateId ?? "",
    productLinkDecided: false,
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
  /** Stones/Stone Types for the "Includes a Stone" picker — see the same
   * prop on InvoiceForm for the full explanation. */
  metals: StoreMetalRow[]
  origins: StoreMetalOriginRow[]
  /** Grams-per-carat per purity (Settings > Purity & Carat > Carat
   * Conversion Rules) — see the same prop on InvoiceForm. */
  caratConversionRates: Record<PurityType, number>
  /** The store's configured GST rates (Settings > GST Rates) — see the
   * same prop on InvoiceForm for the full explanation. */
  gstRates: GstRateRow[]
  /** Legacy last-resort fallback (BusinessSettings.defaultGstRate) — see
   * the same prop on InvoiceForm. */
  defaultGstRate?: number
  /** The store's own state, compared against the selected vendor's state to
   * tell an inter-state purchase (IGST) from an intra-state one (SGST+CGST). */
  storeState?: string | null
  /** Store's default location (Settings > Locations), pre-filled on this
   * create-only form — see Store.defaultLocationId's own doc comment in
   * schema.prisma. Server-side validation on submit (resolveWritableLocationId
   * in purchase-actions.ts) is the actual source of truth for what a
   * restricted user may write; this only seeds the initial UI selection. */
  initialLocationId?: string | null
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
  /** "Paid Now" payment-method rows — see paymentRows' own comment below
   * for why this is an array of rows rather than a single number. */
  paymentRows: PaymentMethodValue[]
  purchaseDate: string
  notes: string
  vendorInvoiceNumber: string
  /** Which line item asked for the new product, so it lands on that row. */
  pendingProductForKey?: string
}

export function PurchaseForm({
  vendors,
  products,
  locations = [],
  metals: initialMetals,
  origins: initialOrigins,
  caratConversionRates,
  gstRates,
  defaultGstRate = 0,
  storeState,
  initialLocationId,
}: PurchaseFormProps) {
  const [metals, setMetals] = useState(initialMetals)
  const [origins, setOrigins] = useState(initialOrigins)
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
  const [locationId, setLocationId] = useState(initialLocationId ?? "")
  // No longer a user-facing control (each line picks its own GST rate in
  // its own Details region, same as Invoice) — this is just what a freshly-
  // added line starts on, resolved once from the store's own default/active
  // GstRate and never changed afterward, so it doesn't need a setter.
  const [gstRateId] = useState<string>(
    () =>
      gstRates.find((r) => r.isDefault && r.isActive)?.id ??
      gstRates.find((r) => r.isActive)?.id ??
      "",
  )
  const [items, setItems] = useState<LineItem[]>(() => [emptyLineItem(gstRateId, "initial")])
  // Collapsed by default, matching Invoice's own compact-by-default rule —
  // see expandedKeys' doc comment on InvoiceForm. A line auto-expands once
  // a Product is picked for it (applyProductToItem below), since that's
  // the moment fields the user still needs to fill in (weights, rate) get
  // meaningful.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const [discount, setDiscount] = useState(0)
  const selectedGstRate = gstRates.find((r) => r.id === gstRateId)
  // Fallback used only when a line's own gstRateId can't be resolved (e.g. a
  // since-deleted rate, or a line added before the store had any GstRate
  // configured) — same last-resort chain as InvoiceForm's own `gstRate`.
  const gstRate = selectedGstRate?.ratePercent ?? defaultGstRate
  // "Paid Now" collects a method (Cash/UPI/etc.) per row, same PaymentMethodFields
  // component the "Record Payment" dialog uses — paidAmount is always derived
  // from these rows (never tracked separately), so it can't go stale relative
  // to what's actually been entered.
  const [paymentRows, setPaymentRows] = useState<PaymentMethodValue[]>([])
  const paidAmount = paymentRows.reduce((sum, row) => sum + (row.amount || 0), 0)

  const selectedVendor = vendors.find((vendor) => vendor.id === vendorId)

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
   * Purchase date, notes, and vendor invoice number are uncontrolled
   * inputs, so they are read off the form element rather than from state.
   */
  const saveDraft = (pendingProductForKey?: string) => {
    const formData = formRef.current ? new FormData(formRef.current) : null

    const draft: PurchaseDraft = {
      vendorId,
      items,
      discount,
      paymentRows,
      purchaseDate: formData ? String(formData.get("purchaseDate") ?? "") : "",
      notes: formData ? String(formData.get("notes") ?? "") : "",
      vendorInvoiceNumber: formData ? String(formData.get("vendorInvoiceNumber") ?? "") : "",
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
      setPaymentRows(draft.paymentRows ?? [])

      let nextItems =
        draft.items && draft.items.length ? draft.items : [emptyLineItem(gstRateId)]

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
                  hsnCode: product.hsnCode ?? "",
                }
              : item,
          )
        }
      }

      setItems(nextItems)
      // Restored, real in-progress data — expanded by default for the same
      // reason a freshly-linked line is (see expandedKeys' own comment),
      // rather than making the user hunt for each chevron after a restore.
      setExpandedKeys(new Set(nextItems.map((item) => item.key)))

      if (formRef.current) {
        const dateInput = formRef.current.elements.namedItem(
          "purchaseDate",
        ) as HTMLInputElement | null
        if (dateInput && draft.purchaseDate) dateInput.value = draft.purchaseDate

        const notesInput = formRef.current.elements.namedItem(
          "notes",
        ) as HTMLTextAreaElement | null
        if (notesInput && draft.notes) notesInput.value = draft.notes

        const vendorInvoiceNumberInput = formRef.current.elements.namedItem(
          "vendorInvoiceNumber",
        ) as HTMLInputElement | null
        if (vendorInvoiceNumberInput && draft.vendorInvoiceNumber) {
          vendorInvoiceNumberInput.value = draft.vendorInvoiceNumber
        }
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

    // Just picks which unit the toggle starts on for this fresh line, not a
    // value conversion — every weight field below starts at 0 regardless.
    const unit = metalById.get(product.metalType?.id ?? "")?.primaryUnit ?? "GRAM"

    updateItem(key, {
      productId,
      productLinkDecided: true,
      itemName: product.name,
      metalTypeId: product.metalType?.id ?? "",
      purity: product.defaultPurity ?? "",
      grossWeightUnit: unit,
      netWeightUnit: unit,
      dmoWeightUnit: unit,
      stoneWeightUnit: unit,
      makingCharge: product.defaultMakingCharge ?? 0,
      makingChargeType: product.defaultMakingChargeType ?? "FIXED",
      stoneCharge: product.hasStoneComponent && product.defaultStoneRate != null && product.defaultCaratWeight != null
        ? Number((product.defaultStoneRate * product.defaultCaratWeight).toFixed(2))
        : product.defaultStoneCharge ?? 0,
      stoneRate: product.hasStoneComponent ? product.defaultStoneRate ?? 0 : 0,
      hasStoneComponent: product.hasStoneComponent,
      stoneChargeTouched: false,
      stoneMetalTypeName: product.hasStoneComponent ? product.defaultStoneMetalTypeName ?? "" : "",
      stoneTypeNames:
        product.hasStoneComponent && product.defaultStoneTypeNames
          ? product.defaultStoneTypeNames.split(",").map((name) => name.trim()).filter(Boolean)
          : [],
      caratWeight: product.defaultCaratWeight ?? 0,
      hsnCode: product.hsnCode ?? "",
    })
    // A product only supplies defaults (making charge, stone, HSN) — weight
    // and rate still need entering by hand, so expand right away instead of
    // making the user hunt for the chevron to find what's still blank.
    setExpandedKeys((prev) => new Set(prev).add(key))
  }

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev))
  }

  // metalTypeId on a line only ever comes from the product picked for it, so
  // this is the same metal-name signal product-form.tsx's classifyPurityFamily
  // uses, just resolved from the `products` list this form already has.
  const metalNameByTypeId = useMemo(() => {
    const map: Record<string, string> = {}
    for (const product of products) {
      if (product.metalType) map[product.metalType.id] = product.metalType.name
    }
    return map
  }, [products])

  // The line's own metal's configured Primary Unit (Settings > Taxonomy) —
  // what Gross/Net/Dmo/Stone Weight are actually persisted in at submit,
  // regardless of what unit is currently toggled for display/entry.
  const metalById = useMemo(() => new Map(metals.map((m) => [m.id, m])), [metals])
  const primaryUnitFor = (item: LineItem) => metalById.get(item.metalTypeId)?.primaryUnit ?? "GRAM"

  // Whether this line's Carat Weight field should show/convert: an explicit
  // Diamond purity (today's existing signal), or a metal name that reads as
  // Diamond/Stone (the only way to catch a Stone line — there's no PurityType
  // for loose gemstones).
  const isCaratLine = (item: LineItem) =>
    item.purity === "DIAMOND" || isCaratWeighedMetal(metalNameByTypeId[item.metalTypeId])

  const handleCaratWeightChange = (item: LineItem, value: string) => {
    const caratWeight = Number(value) || 0
    const patch: Partial<LineItem> = { caratWeight }

    if (isCaratLine(item)) {
      const caratNum = Number(value)
      if (value.trim() !== "" && Number.isFinite(caratNum)) {
        const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
        patch.netWeight = Number((caratNum * gramsPerCarat).toFixed(5))
        patch.netTouched = true
      }
    } else if (item.hasStoneComponent) {
      if (!item.stoneChargeTouched) {
        patch.stoneCharge = Number((item.stoneRate * caratWeight).toFixed(2))
      }

      // Net Stone Weight mirrors Stone Carat Weight until the user edits Net
      // Stone Weight directly (netStoneWeightTouched — same override escape
      // hatch as stoneChargeTouched). stoneWeightInput is always grams
      // internally (see LineItem's own doc comment) — caratWeight is always
      // carats, so this conversion doesn't depend on stoneWeightUnit at all;
      // this also then feeds the metal's own Net Weight via the same
      // gross/stone/dmo calc used elsewhere, unless that has separately been
      // taken over (netTouched).
      if (!item.netStoneWeightTouched) {
        const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
        const stoneWeightInput = Number((caratWeight * gramsPerCarat).toFixed(5))
        patch.stoneWeightInput = stoneWeightInput

        if (!item.netTouched) {
          const derived = deriveNetWeight(item.grossWeight, stoneWeightInput, item.dmoWeight)
          if (derived !== null) patch.netWeight = derived
        }
      }
    }

    updateItem(item.key, patch)
  }

  const handleStoneRateChange = (item: LineItem, value: string) => {
    const stoneRate = Number(value) || 0
    const patch: Partial<LineItem> = { stoneRate }

    if (!item.stoneChargeTouched) {
      patch.stoneCharge = Number((stoneRate * item.caratWeight).toFixed(2))
    }

    updateItem(item.key, patch)
  }

  const handleStoneChargeChange = (item: LineItem, value: string) => {
    updateItem(item.key, { stoneCharge: Number(value) || 0, stoneChargeTouched: true })
  }

  // Editing Net Stone Weight directly is the escape hatch out of the Stone
  // Carat Weight auto-fill above — same override pattern as Stone Charge.
  // `value` is typed in item.stoneWeightUnit; stoneWeightInput itself always
  // stays grams internally (see LineItem's doc comment).
  const handleStoneWeightInputChange = (item: LineItem, value: string) => {
    const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
    const stoneWeightInput = toPrimaryUnit(Number(value) || 0, item.stoneWeightUnit, "GRAM", gramsPerCarat)
    const derived = item.netTouched
      ? undefined
      : deriveNetWeight(item.grossWeight, stoneWeightInput, item.dmoWeight)
    updateItem(item.key, {
      stoneWeightInput,
      netStoneWeightTouched: true,
      ...(derived !== null && derived !== undefined ? { netWeight: derived } : {}),
    })
  }

  // Purely a display/entry-unit switch — stoneWeightInput is already grams
  // internally, so the physical value never changes here, only what's shown.
  const handleStoneWeightUnitChange = (item: LineItem, unit: "GRAM" | "CARAT") => {
    updateItem(item.key, { stoneWeightUnit: unit })
  }

  // `value` is typed in item.netWeightUnit; netWeight itself always stays
  // grams internally (see LineItem's doc comment).
  const handleNetWeightChange = (item: LineItem, value: string) => {
    const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
    const netWeight = toPrimaryUnit(Number(value) || 0, item.netWeightUnit, "GRAM", gramsPerCarat)
    const patch: Partial<LineItem> = { netWeight, netTouched: true }

    if (isCaratLine(item)) {
      patch.caratWeight = Number((netWeight / gramsPerCarat).toFixed(3))
    }

    updateItem(item.key, patch)
  }

  // Diamond items price per carat, not per gram — mirrors lineQuantity in
  // purchase-actions.ts so the live-preview total here never disagrees with
  // what the server actually saves. Stone lines keep pricing off Net Weight
  // (unchanged) — only the Carat Weight field's conversion convenience
  // extends to Stone, not the pricing quantity itself.
  const lineQuantity = (item: LineItem) =>
    item.purity === "DIAMOND" ? item.caratWeight : item.netWeight

  // Taxable value per line: metal + making + stone — the base each line's
  // own GST is computed against. The document's Discount is applied once,
  // at the very end (see totalAmount below), same as Invoice — it does not
  // reduce any individual line's own taxable base.
  const lineTaxableValue = (item: LineItem) =>
    item.rate * lineQuantity(item) + item.makingCharge + item.stoneCharge

  // This line's own GST %, resolved from its own gstRateId against the full
  // `gstRates` prop — falls back to the document-level default (`gstRate`
  // above) when blank or unresolved, never throws. Nothing here zeroes for
  // our own store's Composition scheme (unlike Invoice) — a purchase's GST
  // is whatever the VENDOR's own invoice shows, driven entirely by their
  // registration (isVendorGstApplicable), never by ours.
  const lineGstRatePercent = (item: LineItem) =>
    gstRates.find((r) => r.id === item.gstRateId)?.ratePercent ?? gstRate

  // GST is picked per line now, not once for the whole purchase (see
  // PurchaseItem.gstRateId's doc comment in schema.prisma) — a single
  // vendor bill can genuinely mix rates across items. Every line still
  // shares the same isInterState verdict, since that only depends on the
  // one vendor's state vs. the store's own, both constant for the whole
  // document.
  const lineGst = (item: LineItem) => {
    const breakdown = computePurchaseGst(
      lineTaxableValue(item),
      lineGstRatePercent(item),
      selectedVendor?.gstType ?? "UNREGISTERED",
      storeState,
      selectedVendor?.state,
    )
    const round = (value: number) => Math.round(value * 100) / 100
    return {
      sgst: round(breakdown.sgst),
      cgst: round(breakdown.cgst),
      igst: round(breakdown.igst),
      isInterState: breakdown.isInterState,
    }
  }

  const lineTotal = (item: LineItem) => {
    const { sgst, cgst, igst } = lineGst(item)
    return lineTaxableValue(item) + sgst + cgst + igst
  }

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
  // Recomputed from each line's own sgst/cgst/igst rather than a single
  // document-level rate — see lineGst's own comment above.
  const taxAmount = useMemo(
    () =>
      items.reduce((sum, item) => {
        const { sgst, cgst, igst } = lineGst(item)
        return sum + sgst + cgst + igst
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, selectedVendor?.gstType, selectedVendor?.state, storeState, gstRates, gstRate],
  )

  const totalAmount =
    subtotal + makingChargesTotal + stoneChargesTotal - discount + taxAmount
  const balanceAmount = Math.max(0, totalAmount - paidAmount)

  const itemsJson = JSON.stringify(
    items.map((item) => {
      // Every weight below is tracked internally in grams (see LineItem's
      // doc comment) — converted here, once, to this line's own metal's
      // configured Primary Unit, which is what actually gets persisted.
      const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
      const unit = primaryUnitFor(item)
      const toUnit = (grams: number) => toPrimaryUnit(grams, "GRAM", unit, gramsPerCarat)
      const { sgst, cgst, igst } = lineGst(item)
      return {
        productId: item.productId,
        itemName: item.itemName || "Item",
        metalTypeId: item.metalTypeId || null,
        purity: item.purity || null,
        quantity: item.quantity || 1,
        grossWeight: toUnit(item.grossWeight) || null,
        netWeight: toUnit(item.netWeight) || null,
        caratWeight: item.caratWeight || null,
        rate: item.rate || null,
        makingCharge: item.makingCharge,
        makingChargeType: item.makingChargeType,
        stoneCharge: item.stoneCharge,
        stoneRate: item.hasStoneComponent ? item.stoneRate || null : null,
        stoneMetalTypeName: item.hasStoneComponent ? item.stoneMetalTypeName || null : null,
        stoneTypeNames:
          item.hasStoneComponent && item.stoneTypeNames.length
            ? item.stoneTypeNames.join(", ")
            : null,
        dmoWeight: toUnit(item.dmoWeight) || null,
        stoneWeight: toUnit(item.stoneWeightInput) || null,
        hsnCode: item.hsnCode || null,
        sgstAmount: sgst,
        cgstAmount: cgst,
        igstAmount: igst,
        gstRateId: item.gstRateId || null,
      }
    }),
  )

  const canSubmit = vendorId && items.every((item) => item.productId || item.productLinkDecided)

  // Zero-amount rows (a split row opened but never filled in) are dropped
  // here — the server's parseOptionalPayments requires any row it does
  // receive to carry a real amount.
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
  const paidOverTotal = paidAmount > totalAmount

  // Document-level totals — summed from each line's own split rather than a
  // single computePurchaseGst() call, same reasoning as taxAmount above.
  // Every line shares one isInterState verdict (see lineGst's comment), so
  // summing sgst/cgst/igst separately across lines is safe either way.
  const docSgst = items.reduce((sum, item) => sum + lineGst(item).sgst, 0)
  const docCgst = items.reduce((sum, item) => sum + lineGst(item).cgst, 0)
  const docIgst = items.reduce((sum, item) => sum + lineGst(item).igst, 0)

  // Same compact-row column widths as InvoiceForm's own compactRowGridCols —
  // chevron, Product (searchable, wide), Qty, Net Wt, Rate/g, GST, Amount,
  // remove.
  const compactRowGridCols =
    "grid-cols-[28px_minmax(160px,2fr)_76px_168px_112px_104px_116px_28px]"

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
      <input type="hidden" name="sgstAmount" value={docSgst} />
      <input type="hidden" name="cgstAmount" value={docCgst} />
      <input type="hidden" name="igstAmount" value={docIgst} />
      <input type="hidden" name="gstRateId" value={gstRateId} />
      <input type="hidden" name="paidAmount" value={paidAmount} />
      <input type="hidden" name="paymentsJson" value={paymentsJson} />

      {/* All four fields on one row instead of Vendor/Date filling row one
          and Invoice Number/Location wrapping to a half-empty row two —
          Vendor keeps extra width (2 of 5 columns) since it also carries
          the GST Type hint text below it. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="space-y-2 md:col-span-2 rounded-lg transition-colors focus-within:bg-accent/40">
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
          {selectedVendor ? (
            <p className="text-xs text-muted-foreground">
              Vendor GST Type: <span className="font-medium">{partyGstTypeLabel(selectedVendor.gstType)}</span>
              {!isVendorGstApplicable(selectedVendor.gstType)
                ? " — their invoice can't carry GST, so each line's GST Rate is disabled."
                : ""}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Purchase Date</Label>
          <Input
            type="date"
            name="purchaseDate"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Vendor Invoice Number</Label>
          <Input
            name="vendorInvoiceNumber"
            placeholder="Vendor's own invoice/bill number"
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Store Location</Label>
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
            size="sm"
            onClick={() => setItems((prev) => [...prev, emptyLineItem(gstRateId)])}
            // Same solid-fill treatment as the Invoice form's "Add Item"
            // button (one of this app's chart hues, matching the header's
            // Sale/Purchase button convention) instead of a grey ghost
            // button that blended into the section header.
            className="bg-[var(--chart-4)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-4)_88%,black)]"
          >
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[900px] space-y-2">
            {/* Compact-row layout, same shape as the Invoice form: one dense
                line per item (chevron, Product, Qty, Net Wt, Rate/g, GST,
                Amount, remove) with everything else — Item Name, Purity,
                weights, charges, stone details, this line's own GST Rate —
                tucked behind the chevron in a Details region, instead of
                every field always on screen. */}
            <div
              className={`grid ${compactRowGridCols} items-center gap-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground`}
            >
              <span />
              <span>Product</span>
              <span>Qty</span>
              <span>Net Wt</span>
              <span>Rate / g</span>
              <span>GST</span>
              <span>Amount</span>
              <span />
            </div>

            {items.map((item) => {
              const isExpanded = expandedKeys.has(item.key)
              const gst = lineGst(item)
              const gstTotal = gst.isInterState ? gst.igst : gst.sgst + gst.cgst

              return (
              <div key={item.key} className="rounded-lg border">
                <div className={`grid ${compactRowGridCols} items-start gap-2 p-2`}>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(item.key)}
                    className="mt-1.5 text-muted-foreground hover:text-foreground"
                    aria-label={isExpanded ? "Collapse line item details" : "Expand line item details"}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>

                  <div className="space-y-1">
                    {/* Manual entry (no catalog Product) is an explicit
                        choice from the picker's own "Enter Manually" row,
                        not just leaving this blank — see
                        productLinkDecided's doc comment. The search icon
                        switches back to picking a real product. */}
                    {item.productLinkDecided && !item.productId ? (
                      <div className="flex gap-1">
                        <div className="flex h-9 flex-1 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                          No product — manual entry
                        </div>
                        <button
                          type="button"
                          onClick={() => updateItem(item.key, { productLinkDecided: false })}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label="Pick a product instead"
                          title="Pick a product instead"
                        >
                          <Search className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <ProductSelect
                        key={productSelectKeys[item.key] ?? 0}
                        products={productSelectOptions}
                        name={`product-${item.key}`}
                        defaultValue={item.productId}
                        onChange={(productId) => applyProductToItem(item.key, productId)}
                        addNewHref={`/inventory/products/new?returnTo=${encodeURIComponent(RETURN_TO)}`}
                        onBeforeAddNew={() => saveDraft(item.key)}
                        onSkip={() =>
                          updateItem(item.key, {
                            ...emptyLineItem(gstRateId),
                            key: item.key,
                            productLinkDecided: true,
                          })
                        }
                      />
                    )}
                    {!item.productLinkDecided && (
                      <p className="text-[10px] leading-tight text-destructive">
                        Select a product, or choose &quot;Enter Manually&quot;
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
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

                  <div className="space-y-1">
                    <div className="flex gap-1">
                      <Input
                        type="number"
                        step="0.00001"
                        className="flex-1"
                        value={
                          item.netWeight === 0
                            ? ""
                            : toPrimaryUnit(
                                item.netWeight,
                                "GRAM",
                                item.netWeightUnit,
                                resolveGramsPerCarat(item.purity, caratConversionRates),
                              )
                        }
                        onChange={(e) => handleNetWeightChange(item, e.target.value)}
                      />
                      <Select
                        value={item.netWeightUnit}
                        onValueChange={(unit) => updateItem(item.key, { netWeightUnit: unit as "GRAM" | "CARAT" })}
                      >
                        <SelectTrigger className="w-14" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GRAM">g</SelectItem>
                          <SelectItem value="CARAT">ct</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {!item.netTouched && (
                      <p className="text-[10px] leading-tight text-muted-foreground">Gross − stone</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Input
                      type="number"
                      step="0.01"
                      value={item.rate === 0 ? "" : item.rate}
                      onChange={(e) =>
                        updateItem(item.key, { rate: Number(e.target.value) || 0 })
                      }
                    />
                  </div>

                  <div className="flex h-8 items-center rounded-md border bg-muted px-2 text-xs text-muted-foreground">
                    ₹{gstTotal.toFixed(2)}
                  </div>

                  <div className="flex h-8 items-center rounded-md border bg-muted px-2 text-sm font-medium">
                    ₹{lineTotal(item).toFixed(2)}
                  </div>

                  <div className="flex justify-center pt-1">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.key)}
                        className="text-red-600 hover:text-red-700"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="space-y-3 border-t p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2 space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                        <Label className="text-xs">Item Name</Label>
                        <Input
                          value={item.itemName}
                          onChange={(e) => updateItem(item.key, { itemName: e.target.value })}
                        />
                      </div>

                      <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                        <Label className="text-xs">HSN Code</Label>
                        <Input
                          value={item.hsnCode}
                          onChange={(e) => updateItem(item.key, { hsnCode: e.target.value })}
                          placeholder="e.g. 7113"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
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

                      <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                        <Label className="text-xs">Gross Weight</Label>
                        <div className="flex gap-1">
                          <Input
                            type="number"
                            step="0.00001"
                            className="flex-1"
                            value={
                              item.grossWeight === 0
                                ? ""
                                : toPrimaryUnit(
                                    item.grossWeight,
                                    "GRAM",
                                    item.grossWeightUnit,
                                    resolveGramsPerCarat(item.purity, caratConversionRates),
                                  )
                            }
                            onChange={(e) => {
                              const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
                              const grossWeight = toPrimaryUnit(Number(e.target.value) || 0, item.grossWeightUnit, "GRAM", gramsPerCarat)
                              const derived = item.netTouched
                                ? undefined
                                : deriveNetWeight(grossWeight, item.stoneWeightInput, item.dmoWeight)
                              updateItem(item.key, {
                                grossWeight,
                                ...(derived !== null && derived !== undefined
                                  ? { netWeight: derived }
                                  : {}),
                              })
                            }}
                          />
                          <Select
                            value={item.grossWeightUnit}
                            onValueChange={(unit) => updateItem(item.key, { grossWeightUnit: unit as "GRAM" | "CARAT" })}
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

                      {/* For a carat-weighed line (no "Includes a Stone"
                          toggle applies there at all — see below), Net
                          Stone Weight has no gating concept and always
                          shows here. For every other line, this field is
                          only ever visible once "Includes a Stone" is
                          checked, inside that toggle's own box below —
                          while off, it stays fully hidden (not shown here)
                          rather than relocated, per the toggle's on/off
                          gating. */}
                      {isCaratLine(item) && (
                        <div className="space-y-1">
                          <Label className="text-xs">Net Stone Weight</Label>
                          <div className="flex gap-1">
                            <Input
                              type="number"
                              step="0.00001"
                              className="flex-1"
                              value={
                                item.stoneWeightInput === 0
                                  ? ""
                                  : toPrimaryUnit(
                                      item.stoneWeightInput,
                                      "GRAM",
                                      item.stoneWeightUnit,
                                      resolveGramsPerCarat(item.purity, caratConversionRates),
                                    )
                              }
                              onChange={(e) => handleStoneWeightInputChange(item, e.target.value)}
                            />
                            <Select
                              value={item.stoneWeightUnit}
                              onValueChange={(unit) => handleStoneWeightUnitChange(item, unit as "GRAM" | "CARAT")}
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
                      )}

                      {isCaratLine(item) && (
                        <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                          <Label className="text-xs">Carat Weight (ct)</Label>
                          <Input
                            type="number"
                            step="0.001"
                            value={item.caratWeight === 0 ? "" : item.caratWeight}
                            onChange={(e) => handleCaratWeightChange(item, e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            {item.purity === "DIAMOND"
                              ? "Priced per carat, not per gram"
                              : "1 ct = 0.2 g — converts with Net Weight"}
                          </p>
                        </div>
                      )}

                      <MakingChargeInput
                        rate={item.rate}
                        netWeight={item.netWeight}
                        value={item.makingCharge}
                        onChange={(v) => updateItem(item.key, { makingCharge: v })}
                        chargeType={item.makingChargeType}
                        onChargeTypeChange={(t) => updateItem(item.key, { makingChargeType: t })}
                      />

                      {/* For a carat-weighed line (no "Includes a Stone"
                          toggle applies there at all), Stone Charge always
                          shows here. For every other line, it's only ever
                          visible once "Includes a Stone" is checked, inside
                          that toggle's own box below — while off, no stone
                          means nothing to charge for, so it stays fully
                          hidden here. */}
                      {isCaratLine(item) && (
                        <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                          <Label className="text-xs">Stone Charge</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.stoneCharge === 0 ? "" : item.stoneCharge}
                            onChange={(e) => handleStoneChargeChange(item, e.target.value)}
                          />
                        </div>
                      )}
                    </div>

                    {/* A composite piece (metal + an embedded stone) is the
                        exception, not the rule, for a line whose own metal
                        isn't Diamond/Stone — kept as its own toggled strip
                        rather than wedged into the grid above, so a plain
                        Gold line's fields don't reflow every time this gets
                        checked/unchecked. */}
                    {!isCaratLine(item) && (
                      <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
                        <IncludesStoneToggle
                          checked={item.hasStoneComponent}
                          onChange={(checked) =>
                            updateItem(item.key, {
                              hasStoneComponent: checked,
                              // Net Stone Weight and Stone Charge are now
                              // both hidden once the toggle is off — clear
                              // them so a hidden field can't silently keep
                              // submitting whatever was last entered.
                              ...(checked
                                ? {}
                                : {
                                    stoneWeightInput: 0,
                                    netStoneWeightTouched: false,
                                    stoneCharge: 0,
                                    stoneChargeTouched: false,
                                  }),
                            })
                          }
                        />

                        {item.hasStoneComponent && (
                          <StoneComponentFields
                            metals={metals}
                            origins={origins}
                            onMetalsChange={setMetals}
                            onOriginsChange={setOrigins}
                            stoneMetalTypeName={item.stoneMetalTypeName}
                            onStoneChange={(name, typeNames) =>
                              updateItem(item.key, { stoneMetalTypeName: name, stoneTypeNames: typeNames })
                            }
                            selectedTypeNames={item.stoneTypeNames}
                            onTypesChange={(names) => updateItem(item.key, { stoneTypeNames: names })}
                            caratWeight={item.caratWeight}
                            onCaratWeightChange={(value) => handleCaratWeightChange(item, value)}
                            stoneRate={item.stoneRate}
                            onStoneRateChange={(value) => handleStoneRateChange(item, value)}
                            stoneCharge={item.stoneCharge}
                            onStoneChargeChange={(value) => handleStoneChargeChange(item, value)}
                            stoneChargeTouched={item.stoneChargeTouched}
                            stoneWeightInput={toPrimaryUnit(
                              item.stoneWeightInput,
                              "GRAM",
                              item.stoneWeightUnit,
                              resolveGramsPerCarat(item.purity, caratConversionRates),
                            )}
                            onStoneWeightInputChange={(value) => handleStoneWeightInputChange(item, value)}
                            stoneWeightUnit={item.stoneWeightUnit}
                            onStoneWeightUnitChange={(unit) => handleStoneWeightUnitChange(item, unit)}
                            netStoneWeightTouched={item.netStoneWeightTouched}
                          />
                        )}
                      </div>
                    )}

                    {/* Per-line GST Rate — this line's own selection, no
                        document-level picker anymore (see LineItem.gstRateId's
                        doc comment). Options: active rows, plus this line's
                        own already-selected rate even if it's since been
                        deactivated. */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                        <Label className="text-xs">GST Rate</Label>
                        <Select
                          value={item.gstRateId || undefined}
                          disabled={!selectedVendor || !isVendorGstApplicable(selectedVendor.gstType)}
                          onValueChange={(value) => updateItem(item.key, { gstRateId: value })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select GST rate" />
                          </SelectTrigger>
                          <SelectContent>
                            {gstRates
                              .filter((r) => r.isActive || r.id === item.gstRateId)
                              .map((rate) => (
                                <SelectItem key={rate.id} value={rate.id}>
                                  {rate.name} ({rate.ratePercent}%)
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* SGST+CGST for an intra-state purchase, a single
                          IGST column for inter-state instead — never both,
                          see computePurchaseGst() in lib/gst.ts. The compact
                          row above shows only the combined total, as a
                          quick summary; this is the full breakdown. Percent
                          shown is THIS line's own resolved rate. */}
                      {gst.isInterState ? (
                        <div className="space-y-1">
                          <Label className="text-xs">IGST ({lineGstRatePercent(item).toFixed(2)}%)</Label>
                          <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                            ₹{gst.igst.toFixed(2)}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs">SGST ({(lineGstRatePercent(item) / 2).toFixed(2)}%)</Label>
                            <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                              ₹{gst.sgst.toFixed(2)}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs">CGST ({(lineGstRatePercent(item) / 2).toFixed(2)}%)</Label>
                            <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                              ₹{gst.cgst.toFixed(2)}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Discount / Paid Now / Notes side by side, same boxed-and-tinted
          treatment as the Invoice form — GST no longer has a document-level
          box here at all, each line now picks its own rate in its own
          Details region above. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2 rounded-lg border border-[color-mix(in_oklab,var(--chart-2)_35%,transparent)] bg-[color-mix(in_oklab,var(--chart-2)_6%,transparent)] p-4 transition-colors focus-within:bg-[color-mix(in_oklab,var(--chart-2)_12%,transparent)]">
          <PercentOrFlatInput
            base={subtotal + makingChargesTotal + stoneChargesTotal}
            value={discount}
            onChange={setDiscount}
          />
        </div>

        <div className="rounded-lg border border-[color-mix(in_oklab,var(--chart-3)_35%,transparent)] bg-[color-mix(in_oklab,var(--chart-3)_6%,transparent)] p-4 transition-colors focus-within:bg-[color-mix(in_oklab,var(--chart-3)_12%,transparent)]">
          <PaidNowFields
            rows={paymentRows}
            onRowsChange={setPaymentRows}
            maxAmount={totalAmount > 0 ? totalAmount : undefined}
            // A purchase pays the vendor — money out, not in — so "received"
            // is the wrong word here even though the mechanics (method +
            // amount rows) are identical to a Sale's Paid Now.
            direction="pay"
          />
        </div>

        <div className="space-y-2 rounded-lg border border-[color-mix(in_oklab,var(--chart-1)_35%,transparent)] bg-[color-mix(in_oklab,var(--chart-1)_6%,transparent)] p-4 transition-colors focus-within:bg-[color-mix(in_oklab,var(--chart-1)_12%,transparent)]">
          <Label>Notes</Label>
          <Textarea name="notes" rows={2} />
        </div>
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
          <span>GST (SGST+CGST or IGST)</span>
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

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !canSubmit || paidOverTotal}>
          {pending ? "Creating..." : "Create Purchase"}
        </Button>
      </div>
    </form>
  )
}
