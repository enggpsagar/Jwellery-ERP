"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useActionState } from "react"
import { Plus, Trash2 } from "lucide-react"
import type { GstScheme, PurityType } from "@prisma/client"

import { createQuotation, type QuotationFormState } from "@/lib/actions/quotation-actions"
import { useToast } from "@/components/providers/toast-provider"
import { computeGst } from "@/lib/gst"
import { GstSchemeBadge } from "@/components/shared/gst-scheme-badge"

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
import { CustomerSelect } from "@/components/customers/customer-select"
import { MakingChargeInput } from "@/components/shared/making-charge-input"
import { PercentOrFlatInput } from "@/components/shared/percent-or-flat-input"
import { LocationSelect } from "@/components/shared/location-select"
import { PURITY_SELECT_OPTIONS, isCaratWeighedMetal, isHallmarkablePurity, resolveGramsPerCarat, toPrimaryUnit } from "@/lib/purity"
import { RequiredMark } from "@/components/shared/required-mark"
import type { StoreMetalRow, StoreMetalOriginRow } from "@/lib/actions/taxonomy-actions"
import type { GstRateRow } from "@/lib/actions/gst-rate-actions"
import { StoneComponentFields } from "@/components/inventory/shared/stone-component-fields"
import { StockItemSelect } from "@/components/inventory/shared/stock-item-select"
import { IncludesStoneToggle } from "@/components/ui/includes-stone-toggle"

type CustomerOption = {
  id: string
  name: string
  phone: string | null
  customerCode: string | null
  state: string | null
}

type StockOption = {
  id: string
  stockCode: string
  productName: string
  metalType: { id: string; name: string } | null
  purity: string | null
  grossWeight: number | null
  netWeight: number | null
  caratWeight: number | null
  stoneRate: number | null
  stoneMetalTypeName: string | null
  stoneTypeNames: string | null
  saleRate: number | null
}

type LineItem = {
  key: string
  itemName: string
  metalTypeId: string
  purity: string
  quantity: number
  grossWeight: number
  /** Always in grams internally, regardless of netWeightUnit — that unit
   * only picks what's displayed/typed (converted via toPrimaryUnit on the
   * way in and out) and what unit this line's weights are persisted in at
   * submit. Same convention for stoneWeightInput below. No Gross/Dmo Weight
   * field on this model, unlike Invoice/Purchase/Kacha. */
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
  /** Always in grams internally — see netWeightUnit's doc comment above. */
  stoneWeightInput: number
  stoneWeightUnit: "GRAM" | "CARAT"
  hmCharge: number
  /** Once HM Charge is edited directly, the Purity -> HM Charge auto-fill
   * (Settings' per-piece BIS hallmark rate, applied on Gold/Silver purities
   * only — see isHallmarkablePurity) stops overwriting it — same escape
   * hatch as stoneChargeTouched/netStoneWeightTouched. */
  hmChargeTouched: boolean
  inventoryStockId: string
}

function emptyLineItem(): LineItem {
  return {
    key: crypto.randomUUID(),
    itemName: "",
    metalTypeId: "",
    purity: "",
    quantity: 1,
    grossWeight: 0,
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
    stoneWeightInput: 0,
    stoneWeightUnit: "GRAM",
    hmCharge: 0,
    hmChargeTouched: false,
    inventoryStockId: "",
  }
}

const initialState: QuotationFormState = { success: false, message: "" }

type LocationOption = {
  id: string
  name: string
}

type QuotationFormProps = {
  customers: CustomerOption[]
  stockItems: StockOption[]
  locations?: LocationOption[]
  /** Store's default location (Settings > Locations), pre-filled into the
   * Location field on this create form only — never overrides a value
   * already resolved some other way (there is none today for Quotation's
   * Location field, unlike e.g. a restricted single-location Staff auto-pick
   * elsewhere in the app). */
  defaultLocationId?: string | null
  metals: StoreMetalRow[]
  origins: StoreMetalOriginRow[]
  caratConversionRates: Record<PurityType, number>
  /** Store-configured selling price per Gold/Silver/Platinum purity
   * (Settings > Purity > Metal Selling Rates) — resolved by a line's own
   * `purity` and consulted before falling back to the linked metal's flat
   * StoreMetal.sellingPrice when prefilling a stock-linked line's Rate. */
  metalSellingRates: Partial<Record<PurityType, number>>
  /** The store's configured GST rates (Settings > GST Rates) — see the
   * same prop on InvoiceForm for the full explanation. */
  gstRates: GstRateRow[]
  /** Legacy last-resort fallback (BusinessSettings.defaultGstRate) — see
   * the same prop on InvoiceForm. */
  defaultGstRate?: number
  /** Store's configured per-piece BIS hallmark charge (Settings > Hallmark
   * Charge) — auto-filled into a line's HM Charge the moment its Purity is
   * set to a Gold/Silver value (isHallmarkablePurity), while hmChargeTouched
   * is false. See BusinessSettings.hallmarkChargePerPiece's own doc comment
   * for why this is a store-verified figure, not a guaranteed-current rate. */
  hallmarkChargePerPiece?: number
  /** Drives whether GST can be charged at all (never, for Composition) and
   * how it's split — see computeGst()'s own doc comment in lib/gst.ts. */
  gstScheme: GstScheme
  /** The store's own state, compared against the selected customer's state
   * to tell an inter-state quote (IGST) from an intra-state one (SGST+CGST). */
  storeState?: string | null
}

export function QuotationForm({
  customers,
  stockItems,
  locations = [],
  defaultLocationId = null,
  metals: initialMetals,
  origins: initialOrigins,
  caratConversionRates,
  metalSellingRates,
  gstRates,
  defaultGstRate = 0,
  hallmarkChargePerPiece = 0,
  gstScheme,
  storeState,
}: QuotationFormProps) {
  const router = useRouter()
  const toast = useToast()
  const [metals, setMetals] = useState(initialMetals)
  const [origins, setOrigins] = useState(initialOrigins)
  const metalById = useMemo(() => new Map(metals.map((m) => [m.id, m])), [metals])
  // Stone components are tracked by name (stoneMetalTypeName), not id — no
  // stoneMetalTypeId field exists — so the stone-rate fallback needs its
  // own name-keyed lookup instead of reusing metalById.
  const metalByName = useMemo(
    () => new Map(metals.map((m) => [m.name.toLowerCase(), m])),
    [metals],
  )
  // The line's own metal's configured Primary Unit (Settings > Taxonomy) —
  // what Net Weight/Stone Weight are actually persisted in at submit,
  // regardless of what unit is currently toggled for display/entry.
  const primaryUnitFor = (item: LineItem) => metalById.get(item.metalTypeId)?.primaryUnit ?? "GRAM"

  const [customerId, setCustomerId] = useState("")
  // Seeded from the store's default location (create form only) — matches
  // LocationSelect's own useState(defaultValue)-on-first-render init, so
  // this must already be resolved by the time this component first renders,
  // not set later via an effect.
  const [locationId, setLocationId] = useState(defaultLocationId ?? "")
  const [items, setItems] = useState<LineItem[]>([emptyLineItem()])
  const [discount, setDiscount] = useState(0)
  // A Composition-scheme store can never charge GST — so no rate is
  // selected at all regardless of the store's configured GST Rates.
  const [gstRateId, setGstRateId] = useState<string>(() => {
    if (gstScheme === "COMPOSITION") return ""
    return (
      gstRates.find((r) => r.isDefault && r.isActive)?.id ??
      gstRates.find((r) => r.isActive)?.id ??
      ""
    )
  })
  const availableGstRates = useMemo(
    () => gstRates.filter((r) => r.isActive || r.id === gstRateId),
    [gstRates, gstRateId],
  )
  const selectedGstRate = gstRates.find((r) => r.id === gstRateId)
  // The plain percent, still fed into computeGst() exactly as before — only
  // where the number comes from changed.
  const gstRate =
    gstScheme === "COMPOSITION" ? 0 : (selectedGstRate?.ratePercent ?? defaultGstRate)

  const selectedCustomer = customers.find((customer) => customer.id === customerId)

  const [state, formAction, pending] = useActionState(
    createQuotation,
    initialState,
  )

  useEffect(() => {
    if (state.success && state.quotationId) {
      toast.success(state.message || "Quotation created")
      router.push(`/quotations/${state.quotationId}`)
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const updateItem = (key: string, patch: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    )
  }

  // Auto-fills HM Charge to the store's configured per-piece BIS hallmark
  // rate the moment a line's Purity becomes a Gold/Silver value — never for
  // Platinum/Diamond/Other, and never once the user has typed into HM
  // Charge directly (hmChargeTouched). Plain inline logic in the
  // purity-change handler, not a separate useEffect/local component state —
  // see making-charge-input.tsx's own doc comment for the class of bug that
  // pattern avoids.
  const handlePurityChange = (item: LineItem, purity: string) => {
    const patch: Partial<LineItem> = { purity }
    if (!item.hmChargeTouched && isHallmarkablePurity(purity)) {
      patch.hmCharge = hallmarkChargePerPiece
    }
    updateItem(item.key, patch)
  }

  const handleHmChargeChange = (item: LineItem, value: string) => {
    updateItem(item.key, { hmCharge: Number(value) || 0, hmChargeTouched: true })
  }

  const applyStockToItem = (key: string, stockId: string) => {
    const stock = stockItems.find((s) => s.id === stockId)
    if (!stock) {
      updateItem(key, { inventoryStockId: "" })
      return
    }

    // Already stored in the metal's own configured primary unit — this just
    // picks which unit the toggle starts on, not a value conversion.
    const linkedUnit = metalById.get(stock.metalType?.id ?? "")?.primaryUnit ?? "GRAM"

    updateItem(key, {
      inventoryStockId: stockId,
      itemName: stock.productName,
      metalTypeId: stock.metalType?.id ?? "",
      purity: stock.purity ?? "",
      grossWeight: stock.grossWeight ?? 0,
      netWeight: stock.netWeight ?? 0,
      netWeightUnit: linkedUnit,
      stoneWeightUnit: linkedUnit,
      rate:
        stock.saleRate ??
        metalSellingRates[stock.purity as PurityType] ??
        metalById.get(stock.metalType?.id ?? "")?.sellingPrice ??
        0,
      caratWeight: stock.caratWeight ?? 0,
      stoneRate:
        stock.stoneRate ??
        metalByName.get((stock.stoneMetalTypeName ?? "").toLowerCase())?.sellingPrice ??
        0,
      hasStoneComponent: stock.stoneRate != null,
      stoneCharge: stock.stoneRate != null && stock.caratWeight != null
        ? Number((stock.stoneRate * stock.caratWeight).toFixed(2))
        : 0,
      stoneChargeTouched: false,
      stoneMetalTypeName: stock.stoneMetalTypeName ?? "",
      stoneTypeNames: stock.stoneTypeNames
        ? stock.stoneTypeNames.split(",").map((name) => name.trim()).filter(Boolean)
        : [],
      // InventoryStock carries no hmCharge of its own — nothing
      // authoritative to protect, so this stays untouched and lets the
      // Purity-driven auto-fill populate it instead of locking in a stale 0.
      hmCharge: isHallmarkablePurity(stock.purity) ? hallmarkChargePerPiece : 0,
      hmChargeTouched: false,
    })
  }

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev))
  }

  // metalTypeId on a line only ever comes from the linked stock item, so this
  // is the same metal-name signal product-form.tsx's classifyPurityFamily
  // uses, just resolved from the `stockItems` list this form already has.
  const metalNameByTypeId = useMemo(() => {
    const map: Record<string, string> = {}
    for (const stock of stockItems) {
      if (stock.metalType) map[stock.metalType.id] = stock.metalType.name
    }
    return map
  }, [stockItems])

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
      }
    } else if (item.hasStoneComponent) {
      if (!item.stoneChargeTouched) {
        patch.stoneCharge = Number((item.stoneRate * caratWeight).toFixed(2))
      }

      // Net Stone Weight mirrors Stone Carat Weight until the user edits Net
      // Stone Weight directly (netStoneWeightTouched — same override escape
      // hatch as stoneChargeTouched). stoneWeightInput is always grams
      // internally (see LineItem's own doc comment) — caratWeight is always
      // carats, so this conversion doesn't depend on stoneWeightUnit at all.
      // Unlike Invoice/Purchase/Kacha, a Quotation line has no Gross/Dust
      // weight of its own, so there's no further metal Net Weight to cascade
      // into here.
      if (!item.netStoneWeightTouched) {
        const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
        patch.stoneWeightInput = Number((caratWeight * gramsPerCarat).toFixed(5))
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
    updateItem(item.key, {
      stoneWeightInput: toPrimaryUnit(Number(value) || 0, item.stoneWeightUnit, "GRAM", gramsPerCarat),
      netStoneWeightTouched: true,
    })
  }

  // `value` is typed in item.netWeightUnit; netWeight itself always stays
  // grams internally (see LineItem's doc comment).
  const handleNetWeightChange = (item: LineItem, value: string) => {
    const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
    const netWeight = toPrimaryUnit(Number(value) || 0, item.netWeightUnit, "GRAM", gramsPerCarat)
    const patch: Partial<LineItem> = { netWeight }

    if (isCaratLine(item)) {
      patch.caratWeight = Number((netWeight / gramsPerCarat).toFixed(3))
    }

    updateItem(item.key, patch)
  }

  // Diamond items price per carat, not per gram — mirrors lineQuantity in
  // quotation-actions.ts so the live-preview total here never disagrees
  // with what the server actually saves. Stone lines keep pricing off Net
  // Weight (unchanged) — only the Carat Weight field's conversion
  // convenience extends to Stone, not the pricing quantity itself.
  const lineQuantity = (item: LineItem) =>
    item.purity === "DIAMOND" ? item.caratWeight : item.netWeight

  const lineTotal = (item: LineItem) =>
    item.rate * lineQuantity(item) + item.makingCharge + item.hmCharge + item.stoneCharge

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.rate * lineQuantity(item), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  )
  // Hallmarking charge folds into the quotation's Making Charges total —
  // same convention as invoice-form.tsx's own makingChargesTotal.
  const makingChargesTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.makingCharge + item.hmCharge, 0),
    [items],
  )
  const stoneChargesTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.stoneCharge, 0),
    [items],
  )

  // Quotation records tax at the document level, not per line (see
  // Quotation's own schema comment) — one computeGst() call against the
  // whole taxable base, scheme- and inter-state-aware just like Invoice.
  const taxableValue = subtotal + makingChargesTotal + stoneChargesTotal - discount
  const gstBreakdown = useMemo(() => {
    const breakdown = computeGst(taxableValue, gstRate, gstScheme, storeState, selectedCustomer?.state)
    const round = (value: number) => Math.round(value * 100) / 100
    return {
      sgst: round(breakdown.sgst),
      cgst: round(breakdown.cgst),
      igst: round(breakdown.igst),
      isInterState: breakdown.isInterState,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxableValue, gstRate, gstScheme, storeState, selectedCustomer?.state])
  const taxAmount = gstBreakdown.sgst + gstBreakdown.cgst + gstBreakdown.igst

  const totalAmount =
    subtotal + makingChargesTotal + stoneChargesTotal - discount + taxAmount

  const itemsJson = JSON.stringify(
    items.map((item) => {
      // Every weight below is tracked internally in grams (see LineItem's
      // doc comment) — converted here, once, to this line's own metal's
      // configured Primary Unit, which is what actually gets persisted.
      const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
      const unit = primaryUnitFor(item)
      const toUnit = (grams: number) => toPrimaryUnit(grams, "GRAM", unit, gramsPerCarat)
      return {
        itemName: item.itemName || "Item",
        metalTypeId: item.metalTypeId || null,
        purity: item.purity || null,
        quantity: item.quantity || 1,
        grossWeight: item.grossWeight || null,
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
        stoneWeight: toUnit(item.stoneWeightInput) || null,
        hmCharge: item.hmCharge,
        inventoryStockId: item.inventoryStockId || null,
      }
    }),
  )

  return (
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
      className="space-y-6"
    >
      <input type="hidden" name="itemsJson" value={itemsJson} />
      <input type="hidden" name="discount" value={discount} />
      <input type="hidden" name="taxAmount" value={taxAmount} />
      <input type="hidden" name="gstRateId" value={gstRateId} />
      <input type="hidden" name="sgstAmount" value={gstBreakdown.sgst} />
      <input type="hidden" name="cgstAmount" value={gstBreakdown.cgst} />
      <input type="hidden" name="igstAmount" value={gstBreakdown.igst} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2 md:col-span-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Customer <RequiredMark /></Label>
          <CustomerSelect
            customers={customers}
            defaultValue={customerId}
            onChange={(id) => setCustomerId(id)}
            name="customerId"
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Quotation Date</Label>
          <Input
            type="date"
            name="quotationDate"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <Label>Valid Until</Label>
          <Input type="date" name="validUntil" />
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
                <div className="md:col-span-2 space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                  <Label className="text-xs">Link Stock Item (optional)</Label>
                  <StockItemSelect
                    stockItems={stockItems}
                    value={item.inventoryStockId}
                    onValueChange={(value) => applyStockToItem(item.key, value)}
                    // See invoice-form.tsx's identical comment — a plain
                    // applyStockToItem(key, "") only clears inventoryStockId,
                    // leaving a previously-linked stock's Item Name/weights/
                    // rate in place, so this resets the whole row instead.
                    onCreateNew={() => updateItem(item.key, { ...emptyLineItem(), key: item.key })}
                  />
                </div>

                <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                  <Label className="text-xs">Item Name</Label>
                  <Input
                    value={item.itemName}
                    onChange={(e) => updateItem(item.key, { itemName: e.target.value })}
                  />
                </div>

                <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    // Empty while genuinely blank mid-edit — forcing it
                    // back to 1 on every keystroke made it impossible to
                    // ever delete/replace that digit.
                    value={item.quantity === 0 ? "" : item.quantity}
                    onChange={(e) =>
                      updateItem(item.key, {
                        quantity: e.target.value === "" ? 0 : Number(e.target.value) || 0,
                      })
                    }
                    onBlur={() => {
                      if (!item.quantity) updateItem(item.key, { quantity: 1 })
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                  <Label className="text-xs">Purity</Label>
                  <Select
                    value={item.purity}
                    onValueChange={(value) => handlePurityChange(item, value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select purity" />
                    </SelectTrigger>
                    <SelectContent>
                      {PURITY_SELECT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                  <Label className="text-xs">Net Weight</Label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      step="0.001"
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

                {/* For a carat-weighed line (no "Includes a Stone" toggle
                    applies there at all — see below), Net Stone Weight has
                    no gating concept and always shows here. For every other
                    line, this field is only ever visible once "Includes a
                    Stone" is checked, inside that toggle's own box below —
                    while off, it stays fully hidden (not shown here) rather
                    than relocated, per the toggle's on/off gating. */}
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
                        onValueChange={(unit) =>
                          updateItem(item.key, { stoneWeightUnit: unit as "GRAM" | "CARAT" })
                        }
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

                <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
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

                {/* For a carat-weighed line (no "Includes a Stone" toggle
                    applies there at all), Stone Charge always shows here.
                    For every other line, it's only ever visible once
                    "Includes a Stone" is checked, inside that toggle's own
                    box below — while off, no stone means nothing to charge
                    for, so it stays fully hidden here. */}
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

                <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
                  <Label className="text-xs">HM Charge</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={item.hmCharge === 0 ? "" : item.hmCharge}
                    onChange={(e) => handleHmChargeChange(item, e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Line Total</Label>
                  <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm font-medium">
                    ₹{lineTotal(item).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* A composite piece (metal + an embedded stone) is the
                  exception, not the rule, for a line whose own metal isn't
                  Diamond/Stone — kept as its own toggled strip rather than
                  wedged into the grid above, so a plain Gold line's fields
                  don't reflow every time this gets checked/unchecked. */}
              {!isCaratLine(item) && (
                <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
                  <IncludesStoneToggle
                    checked={item.hasStoneComponent}
                    onChange={(checked) =>
                      updateItem(item.key, {
                        hasStoneComponent: checked,
                        // Net Stone Weight and Stone Charge are now both
                        // hidden once the toggle is off — clear them so a
                        // hidden field can't silently keep submitting
                        // whatever was last entered.
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
                      onStoneWeightUnitChange={(unit) => updateItem(item.key, { stoneWeightUnit: unit })}
                      netStoneWeightTouched={item.netStoneWeightTouched}
                    />
                  )}
                </div>
              )}

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <PercentOrFlatInput
            base={subtotal + makingChargesTotal + stoneChargesTotal}
            value={discount}
            onChange={setDiscount}
          />
        </div>

        <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
          <div className="flex items-center justify-between">
            <Label>GST Rate</Label>
            <GstSchemeBadge scheme={gstScheme} />
          </div>
          <Select
            value={gstRateId || undefined}
            disabled={gstScheme === "COMPOSITION"}
            onValueChange={(value) => setGstRateId(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select GST rate" />
            </SelectTrigger>
            <SelectContent>
              {availableGstRates.map((rate) => (
                <SelectItem key={rate.id} value={rate.id}>
                  {rate.name} ({rate.ratePercent}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {gstScheme === "COMPOSITION"
              ? "Not used — Composition Scheme never charges GST."
              : gstBreakdown.isInterState
                ? `IGST (inter-state) — total tax ₹${taxAmount.toFixed(2)}`
                : `SGST + CGST (intra-state) — total tax ₹${taxAmount.toFixed(2)}`}
          </p>
        </div>
      </div>

      {gstScheme !== "COMPOSITION" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {gstBreakdown.isInterState ? (
            <div className="space-y-2">
              <Label className="text-xs">IGST ({gstRate.toFixed(2)}%)</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                ₹{gstBreakdown.igst.toFixed(2)}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-xs">SGST ({(gstRate / 2).toFixed(2)}%)</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                  ₹{gstBreakdown.sgst.toFixed(2)}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">CGST ({(gstRate / 2).toFixed(2)}%)</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                  ₹{gstBreakdown.cgst.toFixed(2)}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label>Notes</Label>
        <Textarea name="notes" rows={2} />
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Subtotal (metal value)</span>
          <span>₹{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Making Charges (incl. HM)</span>
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
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !customerId}>
          {pending ? "Creating..." : "Create Quotation"}
        </Button>
      </div>
    </form>
  )
}
