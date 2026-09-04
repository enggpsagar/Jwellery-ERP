"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useActionState } from "react"
import { Plus, Trash2 } from "lucide-react"

import {
  createKachaInvoice,
  type KachaInvoiceFormState,
} from "@/lib/actions/kacha-invoice-actions"
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
import { CustomerSelect } from "@/components/customers/customer-select"
import { MakingChargeInput } from "@/components/shared/making-charge-input"
import { PercentOrFlatInput } from "@/components/shared/percent-or-flat-input"
import { RequiredMark } from "@/components/shared/required-mark"
import { LocationSelect, type LocationOption } from "@/components/shared/location-select"
import { PaidNowFields } from "@/components/shared/paid-now-fields"
import type { PaymentMethodValue } from "@/components/shared/payment-method-fields"
import { PURITY_SELECT_OPTIONS, stoneWeightToGrams, isCaratWeighedMetal, isHallmarkablePurity, resolveGramsPerCarat } from "@/lib/purity"
import type { PurityType } from "@prisma/client"
import type { StoreMetalRow, StoreMetalOriginRow } from "@/lib/actions/taxonomy-actions"
import { StoneComponentFields } from "@/components/inventory/shared/stone-component-fields"
import { IncludesStoneToggle } from "@/components/ui/includes-stone-toggle"

type CustomerOption = {
  id: string
  name: string
  phone: string | null
  customerCode: string | null
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
  quantity: number
}

type LineItem = {
  key: string
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
  stoneWeightInput: number
  stoneWeightUnit: "GRAM" | "CARAT"
  hmCharge: number
  /** Once HM Charge is edited directly, the Purity -> HM Charge auto-fill
   * (Settings' per-piece BIS hallmark rate, applied on Gold/Silver purities
   * only — see isHallmarkablePurity) stops overwriting it — same escape
   * hatch as stoneChargeTouched/netStoneWeightTouched. */
  hmChargeTouched: boolean
  inventoryStockId: string
  /** Once Net Weight is edited directly, the gross/dmo auto-calc stops
   * overwriting it. */
  netTouched: boolean
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
    dmoWeight: 0,
    stoneWeightInput: 0,
    stoneWeightUnit: "GRAM",
    hmCharge: 0,
    hmChargeTouched: false,
    inventoryStockId: "",
    netTouched: false,
  }
}

function deriveNetWeight(grossWeight: number, stoneWeight: number, dmoWeight: number) {
  if (!grossWeight) return null
  const net = grossWeight - stoneWeight - dmoWeight
  return net >= 0 ? Number(net.toFixed(3)) : null
}

const initialState: KachaInvoiceFormState = { success: false, message: "" }

type KachaInvoiceFormProps = {
  customers: CustomerOption[]
  stockItems: StockOption[]
  locations: LocationOption[]
  metals: StoreMetalRow[]
  origins: StoreMetalOriginRow[]
  caratConversionRates: Record<PurityType, number>
  /** Store's configured per-piece BIS hallmark charge (Settings > Hallmark
   * Charge) — auto-filled into a line's HM Charge the moment its Purity is
   * set to a Gold/Silver value (isHallmarkablePurity), while hmChargeTouched
   * is false. See BusinessSettings.hallmarkChargePerPiece's own doc comment
   * for why this is a store-verified figure, not a guaranteed-current rate. */
  hallmarkChargePerPiece?: number
}

export function KachaInvoiceForm({
  customers,
  stockItems,
  locations,
  metals: initialMetals,
  origins: initialOrigins,
  caratConversionRates,
  hallmarkChargePerPiece = 0,
}: KachaInvoiceFormProps) {
  const [metals, setMetals] = useState(initialMetals)
  const [origins, setOrigins] = useState(initialOrigins)
  const router = useRouter()
  const toast = useToast()

  const [customerId, setCustomerId] = useState("")
  const [locationId, setLocationId] = useState("")
  const [items, setItems] = useState<LineItem[]>([emptyLineItem()])
  const [discount, setDiscount] = useState(0)
  // "Paid Now" collects a method (Cash/UPI/etc.) per row, same PaymentMethodFields
  // component the "Record Payment" dialog uses — paidAmount is always derived
  // from these rows (never tracked separately), so it can't go stale relative
  // to what's actually been entered.
  const [paymentRows, setPaymentRows] = useState<PaymentMethodValue[]>([])
  const paidAmount = paymentRows.reduce((sum, row) => sum + (row.amount || 0), 0)

  const [state, formAction, pending] = useActionState(
    createKachaInvoice,
    initialState,
  )

  useEffect(() => {
    if (state.success && state.kachaInvoiceId) {
      toast.success(state.message || "Kacha slip created")
      router.push(`/billing/kacha/${state.kachaInvoiceId}`)
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

  // How many units of a stock row are still free to add, given what other
  // lines in THIS cart already claim.
  const availableForStock = (stockId: string, excludeKey: string) => {
    const stock = stockItems.find((s) => s.id === stockId)
    if (!stock) return 0
    const claimedByOtherLines = items
      .filter((item) => item.key !== excludeKey && item.inventoryStockId === stockId)
      .reduce((sum, item) => sum + (item.quantity || 0), 0)
    return Math.max(0, stock.quantity - claimedByOtherLines)
  }

  const applyStockToItem = (key: string, stockId: string) => {
    const stock = stockItems.find((s) => s.id === stockId)
    if (!stock) {
      updateItem(key, { inventoryStockId: "" })
      return
    }

    const available = availableForStock(stockId, key)

    updateItem(key, {
      inventoryStockId: stockId,
      itemName: stock.productName,
      metalTypeId: stock.metalType?.id ?? "",
      purity: stock.purity ?? "",
      grossWeight: stock.grossWeight ?? 0,
      netWeight: stock.netWeight ?? 0,
      rate: stock.saleRate ?? 0,
      quantity: available > 0 ? 1 : 0,
      caratWeight: stock.caratWeight ?? 0,
      stoneRate: stock.stoneRate ?? 0,
      hasStoneComponent: stock.stoneRate != null,
      stoneCharge: stock.stoneRate != null && stock.caratWeight != null
        ? Number((stock.stoneRate * stock.caratWeight).toFixed(2))
        : 0,
      stoneChargeTouched: false,
      // Unlike invoice-form.tsx, this form's StockOption never carries the
      // stock row's own stoneWeight to begin with (nothing set above), so
      // there's nothing authoritative here to protect — locking this
      // unconditionally to `true` (the previous bug) permanently blocked
      // Net Stone Weight from ever auto-filling from Stone Carat Weight.
      netStoneWeightTouched: false,
      stoneMetalTypeName: stock.stoneMetalTypeName ?? "",
      stoneTypeNames: stock.stoneTypeNames
        ? stock.stoneTypeNames.split(",").map((name) => name.trim()).filter(Boolean)
        : [],
      // Same reasoning as netStoneWeightTouched above — InventoryStock
      // carries no hmCharge of its own, so there's nothing authoritative to
      // protect; left untouched so the Purity-driven auto-fill populates it.
      hmCharge: isHallmarkablePurity(stock.purity) ? hallmarkChargePerPiece : 0,
      hmChargeTouched: false,
      // The linked stock row's own net weight is authoritative — the
      // gross/dmo calc below must not silently recompute over it.
      netTouched: true,
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
        patch.netTouched = true
      }
    } else if (item.hasStoneComponent) {
      if (!item.stoneChargeTouched) {
        patch.stoneCharge = Number((item.stoneRate * caratWeight).toFixed(2))
      }

      // Net Stone Weight mirrors Stone Carat Weight until the user edits Net
      // Stone Weight directly (netStoneWeightTouched — same override escape
      // hatch as stoneChargeTouched). Converted to grams when the Net Stone
      // Weight unit is set to grams (via the same resolveGramsPerCarat rate
      // this line already uses elsewhere), so the mirrored value is always
      // correct regardless of which unit is displayed — this also then feeds
      // the metal's own Net Weight via the same gross/stone/dmo calc used
      // elsewhere, unless that has separately been taken over (netTouched).
      if (!item.netStoneWeightTouched) {
        const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
        const stoneWeightInput =
          item.stoneWeightUnit === "CARAT"
            ? caratWeight
            : Number((caratWeight * gramsPerCarat).toFixed(5))
        patch.stoneWeightInput = stoneWeightInput

        if (!item.netTouched) {
          const grams = stoneWeightToGrams(stoneWeightInput, item.stoneWeightUnit, gramsPerCarat)
          const derived = deriveNetWeight(item.grossWeight, grams, item.dmoWeight)
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
  const handleStoneWeightInputChange = (item: LineItem, value: string) => {
    const stoneWeightInput = Number(value) || 0
    const grams = stoneWeightToGrams(stoneWeightInput, item.stoneWeightUnit, resolveGramsPerCarat(item.purity, caratConversionRates))
    const derived = item.netTouched
      ? null
      : deriveNetWeight(item.grossWeight, grams, item.dmoWeight)
    updateItem(item.key, {
      stoneWeightInput,
      netStoneWeightTouched: true,
      ...(derived !== null ? { netWeight: derived } : {}),
    })
  }

  const handleStoneWeightUnitChange = (item: LineItem, unit: "GRAM" | "CARAT") => {
    const grams = stoneWeightToGrams(item.stoneWeightInput, unit, resolveGramsPerCarat(item.purity, caratConversionRates))
    const derived = item.netTouched
      ? null
      : deriveNetWeight(item.grossWeight, grams, item.dmoWeight)
    updateItem(item.key, {
      stoneWeightUnit: unit,
      ...(derived !== null ? { netWeight: derived } : {}),
    })
  }

  const handleNetWeightChange = (item: LineItem, value: string) => {
    const netWeight = Number(value) || 0
    const patch: Partial<LineItem> = { netWeight, netTouched: true }

    if (isCaratLine(item)) {
      const netNum = Number(value)
      const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
      patch.caratWeight =
        value.trim() !== "" && Number.isFinite(netNum)
          ? Number((netNum / gramsPerCarat).toFixed(3))
          : 0
    }

    updateItem(item.key, patch)
  }

  // Diamond items price per carat, not per gram — mirrors lineQuantity in
  // kacha-invoice-actions.ts so the live-preview total here never disagrees
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
  // Hallmarking charge folds into the slip's Making Charges total — same
  // convention as invoice-form.tsx's own makingChargesTotal.
  const makingChargesTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.makingCharge + item.hmCharge, 0),
    [items],
  )
  const stoneChargesTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.stoneCharge, 0),
    [items],
  )
  const totalAmount = subtotal + makingChargesTotal + stoneChargesTotal - discount
  const balanceAmount = Math.max(0, totalAmount - paidAmount)

  const itemsJson = JSON.stringify(
    items.map((item) => ({
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
      stoneRate: item.hasStoneComponent ? item.stoneRate || null : null,
      stoneMetalTypeName: item.hasStoneComponent ? item.stoneMetalTypeName || null : null,
      stoneTypeNames:
        item.hasStoneComponent && item.stoneTypeNames.length
          ? item.stoneTypeNames.join(", ")
          : null,
      dmoWeight: item.dmoWeight || null,
      stoneWeight: stoneWeightToGrams(item.stoneWeightInput, item.stoneWeightUnit, resolveGramsPerCarat(item.purity, caratConversionRates)) || null,
      hmCharge: item.hmCharge,
      inventoryStockId: item.inventoryStockId || null,
    })),
  )

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
      <input type="hidden" name="paidAmount" value={paidAmount} />
      <input type="hidden" name="paymentsJson" value={paymentsJson} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label>Customer <RequiredMark /></Label>
          <CustomerSelect
            customers={customers}
            defaultValue={customerId}
            onChange={(id) => setCustomerId(id)}
            name="customerId"
          />
        </div>

        <div className="space-y-2">
          <Label>Slip Date</Label>
          <Input
            type="date"
            name="invoiceDate"
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
                  <Label className="text-xs">Link Stock Item (optional)</Label>
                  <Select
                    value={item.inventoryStockId}
                    onValueChange={(value) => applyStockToItem(item.key, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Not linked to stock" />
                    </SelectTrigger>
                    <SelectContent>
                      {stockItems.map((stock) => {
                        const available = availableForStock(stock.id, item.key)
                        return (
                          <SelectItem key={stock.id} value={stock.id} disabled={available <= 0}>
                            {stock.stockCode} — {stock.productName} ({available} available)
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
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
                    max={item.inventoryStockId ? availableForStock(item.inventoryStockId, item.key) : undefined}
                    value={item.quantity}
                    onChange={(e) => {
                      const requested = Number(e.target.value) || 1
                      const quantity = item.inventoryStockId
                        ? Math.min(requested, Math.max(availableForStock(item.inventoryStockId, item.key), 1))
                        : requested
                      updateItem(item.key, { quantity })
                    }}
                  />
                  {item.inventoryStockId && (
                    <p className="text-xs text-muted-foreground">
                      {availableForStock(item.inventoryStockId, item.key)} in stock
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="space-y-1">
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

                <div className="space-y-1">
                  <Label className="text-xs">Gross Weight (g)</Label>
                  <Input
                    type="number"
                    step="0.00001"
                    value={item.grossWeight === 0 ? "" : item.grossWeight}
                    onChange={(e) => {
                      const grossWeight = Number(e.target.value) || 0
                      const stoneWeightGrams = stoneWeightToGrams(item.stoneWeightInput, item.stoneWeightUnit, resolveGramsPerCarat(item.purity, caratConversionRates))
                      const derived = item.netTouched
                        ? null
                        : deriveNetWeight(grossWeight, stoneWeightGrams, item.dmoWeight)
                      updateItem(item.key, {
                        grossWeight,
                        ...(derived !== null ? { netWeight: derived } : {}),
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
                    onChange={(e) => handleNetWeightChange(item, e.target.value)}
                  />
                  {!item.netTouched && (
                    <p className="text-xs text-muted-foreground">Gross − stone − dust/other</p>
                  )}
                </div>

                {/* Once this is a composite line with "Includes a Stone"
                    checked, Net Stone Weight moves down into that box, next
                    to the Stone Carat Weight it mirrors — see below. */}
                {(isCaratLine(item) || !item.hasStoneComponent) && (
                  <div className="space-y-1">
                    <Label className="text-xs">Net Stone Weight</Label>
                    <div className="flex gap-1">
                      <Input
                        type="number"
                        step="0.00001"
                        className="flex-1"
                        value={item.stoneWeightInput === 0 ? "" : item.stoneWeightInput}
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
                  <div className="space-y-1">
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

                <div className="space-y-1">
                  <Label className="text-xs">Dust/Making/Other Wt (g)</Label>
                  <Input
                    type="number"
                    step="0.00001"
                    value={item.dmoWeight === 0 ? "" : item.dmoWeight}
                    onChange={(e) => {
                      const dmoWeight = Number(e.target.value) || 0
                      const stoneWeightGrams = stoneWeightToGrams(item.stoneWeightInput, item.stoneWeightUnit, resolveGramsPerCarat(item.purity, caratConversionRates))
                      const derived = item.netTouched
                        ? null
                        : deriveNetWeight(item.grossWeight, stoneWeightGrams, dmoWeight)
                      updateItem(item.key, {
                        dmoWeight,
                        ...(derived !== null ? { netWeight: derived } : {}),
                      })
                    }}
                  />
                </div>

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

              </div>

              {/* Its own row, sized to its own fields, rather than wrapping
                  onto a mostly-empty line of the 6-column grid above. */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MakingChargeInput
                  rate={item.rate}
                  netWeight={item.netWeight}
                  value={item.makingCharge}
                  onChange={(v) => updateItem(item.key, { makingCharge: v })}
                  chargeType={item.makingChargeType}
                  onChargeTypeChange={(t) => updateItem(item.key, { makingChargeType: t })}
                />

                {/* Once this is a composite line with "Includes a Stone"
                    checked, Stone Charge moves down into that box, next to
                    the Carat Weight/Rate it's computed from — see below. */}
                {(isCaratLine(item) || !item.hasStoneComponent) && (
                  <div className="space-y-1">
                    <Label className="text-xs">Stone Charge</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.stoneCharge === 0 ? "" : item.stoneCharge}
                      onChange={(e) => handleStoneChargeChange(item, e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-1">
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
                    onChange={(checked) => updateItem(item.key, { hasStoneComponent: checked })}
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
                      stoneWeightInput={item.stoneWeightInput}
                      onStoneWeightInputChange={(value) => handleStoneWeightInputChange(item, value)}
                      stoneWeightUnit={item.stoneWeightUnit}
                      onStoneWeightUnitChange={(unit) => handleStoneWeightUnitChange(item, unit)}
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

      <div className="max-w-sm space-y-2">
        <PercentOrFlatInput
          base={subtotal + makingChargesTotal + stoneChargesTotal}
          value={discount}
          onChange={setDiscount}
        />
      </div>

      <PaidNowFields
        rows={paymentRows}
        onRowsChange={setPaymentRows}
        maxAmount={totalAmount > 0 ? totalAmount : undefined}
      />

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
        <Button type="submit" disabled={pending || !customerId || paidOverTotal}>
          {pending ? "Creating..." : "Create Kacha Slip"}
        </Button>
      </div>
    </form>
  )
}
