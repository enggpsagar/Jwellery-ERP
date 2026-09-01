"use client"

import { useEffect, useMemo, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, Trash2 } from "lucide-react"

import type { ChargeType } from "@prisma/client"

import {
  receiveItemsFromKarigar,
  type StockActionState,
} from "@/lib/actions/inventory-stock-actions"
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions"
import { classifyMetalName } from "@/lib/business-units"
import { LocationSelect } from "@/components/shared/location-select"
import { useToast } from "@/components/providers/toast-provider"
import { ProductSelect, type ProductOption } from "@/components/inventory/shared/product-select"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MakingChargeInput } from "@/components/shared/making-charge-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RequiredMark } from "@/components/shared/required-mark"

const initialState: StockActionState = { success: false, message: "" }

// "OTHER" is intentionally not in this list — it's no longer a value a user
// picks from a dropdown, it's auto-applied when the selected metal has no
// purity (see the per-item Metal Type <Select> below).
const PURITY_OPTIONS: { value: string; label: string }[] = [
  { value: "GOLD_24K", label: "Gold 24K" },
  { value: "GOLD_22K", label: "Gold 22K" },
  { value: "GOLD_20K", label: "Gold 20K" },
  { value: "GOLD_18K", label: "Gold 18K" },
  { value: "SILVER_999", label: "Silver 999" },
  { value: "SILVER_925", label: "Silver 925" },
  { value: "PLATINUM_950", label: "Platinum 950" },
  { value: "PLATINUM_900", label: "Platinum 900" },
]

type ReceiptItem = {
  key: string
  itemName: string
  productId: string
  metalTypeId: string
  purity: string
  quantity: number
  grossWeight: number
  lessWeight: number
  netWeight: number
  stoneWeight: number
  dmoWeight: number
  wastagePercent: number
  tagNumber: string
  purchaseRate: number
  saleRate: number
  makingCharge: number
  makingChargeType: ChargeType
  stoneCharge: number
  otherCharge: number
  purchaseAmount: number
  saleAmount: number
  purchaseDate: string
  manufactureDate: string
  locationId: string
  remarks: string
  /** Once Net Weight is edited directly, the gross/less/stone/dmo auto-calc
   * stops overwriting it — same override rule as the Add Stock form. */
  netTouched: boolean
}

function deriveNetWeight(
  grossWeight: number,
  lessWeight: number,
  stoneWeight: number,
  dmoWeight: number,
) {
  if (!grossWeight) return null
  const net = grossWeight - lessWeight - stoneWeight - dmoWeight
  return net >= 0 ? Number(net.toFixed(3)) : null
}

// Every returned item becomes brand-new sellable InventoryStock (see
// receiveItemsFromKarigar) — a "fresh product" exactly like one entered via
// the Add Stock form, so it carries the same field set as StockForm
// (components/inventory/stock/stock-form.tsx), not just the weight fields
// needed for the karigar fine-gold ledger calc.
function emptyReceiptItem(defaultMetal?: StoreMetalRow): ReceiptItem {
  return {
    key: crypto.randomUUID(),
    itemName: "",
    productId: "",
    metalTypeId: defaultMetal?.id ?? "",
    purity:
      defaultMetal && !defaultMetal.hasPurity
        ? "OTHER"
        : defaultMetal?.name.toLowerCase().includes("platinum")
          ? "PLATINUM_950"
          : classifyMetalName(defaultMetal?.name) === "SILVER"
            ? "SILVER_999"
            : "GOLD_22K",
    quantity: 1,
    grossWeight: 0,
    lessWeight: 0,
    netWeight: 0,
    stoneWeight: 0,
    dmoWeight: 0,
    wastagePercent: 0,
    tagNumber: "",
    purchaseRate: 0,
    saleRate: 0,
    makingCharge: 0,
    makingChargeType: "FIXED",
    stoneCharge: 0,
    otherCharge: 0,
    purchaseAmount: 0,
    saleAmount: 0,
    purchaseDate: "",
    manufactureDate: "",
    locationId: "",
    remarks: "",
    netTouched: false,
  }
}

type LocationOption = {
  id: string
  name: string
}

type ReceiveItemsFormProps = {
  karigarId: string
  jobId: string
  products: ProductOption[]
  fineness: Record<string, number>
  metals: StoreMetalRow[]
  locations: LocationOption[]
}

export function ReceiveItemsForm({
  karigarId,
  jobId,
  products,
  fineness,
  metals,
  locations,
}: ReceiveItemsFormProps) {
  const activeMetals = useMemo(() => metals.filter((m) => m.isActive), [metals])
  // Mirrors the old hardcoded default of "GOLD": prefer a hasPurity metal if
  // one exists, otherwise just fall back to whatever is first in the list.
  const defaultMetal = useMemo(
    () => activeMetals.find((m) => m.hasPurity) ?? activeMetals[0],
    [activeMetals],
  )
  const metalById = useMemo(
    () => new Map(activeMetals.map((metal) => [metal.id, metal])),
    [activeMetals],
  )

  const [items, setItems] = useState<ReceiptItem[]>([emptyReceiptItem(defaultMetal)])
  const [labourCharge, setLabourCharge] = useState(0)
  const router = useRouter()
  const toast = useToast()

  const receiveItemsWithId = receiveItemsFromKarigar.bind(null, jobId)
  const [state, formAction, pending] = useActionState(receiveItemsWithId, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Items received")

      const timer = setTimeout(() => {
        router.push(`/karigars/${karigarId}`)
        router.refresh()
      }, 800)

      return () => clearTimeout(timer)
    }

    if (!state.success && state.message) {
      toast.error(state.message)
    }
  }, [state, router, toast, karigarId])

  const updateItem = (key: string, patch: Partial<ReceiptItem>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  // Purity values are Gold-only or Silver-only (see PURITY_OPTIONS below) —
  // switching metal must re-pick a purity that's actually valid for the new
  // metal, not just keep whatever was set for the old one (e.g. Gold ->
  // Silver must not leave "GOLD_22K" silently selected).
  const purityOptionsForMetal = (metal: StoreMetalRow | undefined) => {
    if (metal?.name.toLowerCase().includes("platinum")) {
      return PURITY_OPTIONS.filter((o) => o.value.startsWith("PLATINUM_"))
    }
    const family = classifyMetalName(metal?.name)
    if (family === "SILVER") return PURITY_OPTIONS.filter((o) => o.value.startsWith("SILVER_"))
    if (family === "GOLD") return PURITY_OPTIONS.filter((o) => o.value.startsWith("GOLD_"))
    return PURITY_OPTIONS
  }

  const updateItemMetal = (key: string, metalTypeId: string) => {
    const metal = metalById.get(metalTypeId)
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item
        if (!metal || metal.hasPurity) {
          // Switching into (or staying in) a hasPurity metal: keep the
          // current purity only if it's still valid for this metal's family,
          // otherwise fall back to that family's first option.
          const validOptions = purityOptionsForMetal(metal)
          const purity = validOptions.some((o) => o.value === item.purity)
            ? item.purity
            : (validOptions[0]?.value ?? "GOLD_22K")
          return { ...item, metalTypeId, purity }
        }
        // hasPurity=false: purity has no meaning, force the sentinel value
        // the backend requires (KarigarReceiptItem.purity is non-nullable).
        return { ...item, metalTypeId, purity: "OTHER" }
      }),
    )
  }

  const applyProductToItem = (key: string, productId: string, product: ProductOption | undefined) => {
    if (!product) {
      updateItem(key, { productId: "" })
      return
    }

    // Only the item name comes from the product here — Product's own Metal
    // Type is being converted to the same StoreMetal relation in a parallel
    // change, so this dialog doesn't couple to that field's shape and lets
    // the user pick Metal Type per returned item directly instead.
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item
        const metal = metalById.get(item.metalTypeId)
        const nextPurity =
          metal && !metal.hasPurity ? item.purity : product.defaultPurity ?? item.purity
        return { ...item, productId, itemName: product.name, purity: nextPurity }
      }),
    )
  }

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev))
  }

  // Mirrors the server's accounted-fine-weight formula in receiveItemsFromKarigar:
  // fineWeight (pure embedded-metal calc) + wastage% on top of it, so the preview
  // shown before submit matches what actually gets stored/credited.
  const fineWeightOf = (item: ReceiptItem) => {
    const percent = fineness[item.purity] ?? 100
    const fineWeight = (item.netWeight * percent) / 100
    return fineWeight + (fineWeight * (item.wastagePercent || 0)) / 100
  }

  // A product already picked on one returned item can't be picked again on
  // another — each row still sees its own current pick (so re-opening the
  // dropdown doesn't hide the selection), just not the other rows' picks.
  // Leaving Product blank (auto-create) is unaffected either way.
  const selectedProductIds = useMemo(
    () => new Set(items.map((item) => item.productId).filter(Boolean)),
    [items],
  )
  const productsFor = (item: ReceiptItem) =>
    products.filter((product) => product.id === item.productId || !selectedProductIds.has(product.id))

  const totalNetWeight = useMemo(
    () => items.reduce((sum, item) => sum + (item.netWeight || 0), 0),
    [items],
  )
  const totalFineWeight = useMemo(
    () => items.reduce((sum, item) => sum + fineWeightOf(item), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, fineness],
  )
  // Basis for Labour Charge's "% of metal value" mode — sum of each item's
  // own purchaseRate x netWeight, i.e. the same per-line "metal value"
  // MakingChargeInput already uses, just totalled across the whole job.
  const totalMetalValue = useMemo(
    () => items.reduce((sum, item) => sum + (item.purchaseRate || 0) * (item.netWeight || 0), 0),
    [items],
  )

  const itemsJson = JSON.stringify(
    items.map((item) => ({
      itemName: item.itemName || "Item",
      productId: item.productId || null,
      metalTypeId: item.metalTypeId,
      purity: item.purity,
      quantity: item.quantity || 1,
      grossWeight: item.grossWeight || null,
      lessWeight: item.lessWeight || null,
      netWeight: item.netWeight || null,
      stoneWeight: item.stoneWeight || null,
      dmoWeight: item.dmoWeight || null,
      wastagePercent: item.wastagePercent || null,
      tagNumber: item.tagNumber || null,
      purchaseRate: item.purchaseRate || null,
      saleRate: item.saleRate || null,
      makingCharge: item.makingCharge || null,
      makingChargeType: item.makingChargeType,
      stoneCharge: item.stoneCharge || null,
      otherCharge: item.otherCharge || null,
      purchaseAmount: item.purchaseAmount || null,
      saleAmount: item.saleAmount || null,
      purchaseDate: item.purchaseDate || null,
      manufactureDate: item.manufactureDate || null,
      locationId: item.locationId || null,
      remarks: item.remarks || null,
    })),
  )

  const canSubmit = items.every((item) => item.netWeight > 0 && item.metalTypeId)

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
      <input type="hidden" name="labourCharge" value={labourCharge} />

      {!state.success && state.message && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Returned Items</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setItems((prev) => [...prev, emptyReceiptItem(defaultMetal)])}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Item
        </Button>
      </div>

      <div className="space-y-6">
        {items.map((item, index) => {
          const selectedMetal = metalById.get(item.metalTypeId)
          const hasPurity = selectedMetal?.hasPurity ?? true

          return (
            <Card key={item.key}>
              <CardHeader>
                <CardTitle>Item {index + 1}</CardTitle>
                {items.length > 1 && (
                  <CardAction>
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
                    >
                      <Trash2 className="h-3 w-3" /> Remove item
                    </button>
                  </CardAction>
                )}
              </CardHeader>

              <CardContent className="space-y-6">
                {/* ============================
                    ITEM DETAILS
                ============================ */}
                <div className="grid gap-4 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Product</Label>
                    <ProductSelect
                      products={productsFor(item)}
                      name={`product-${item.key}`}
                      defaultValue={item.productId}
                      placeholder="Optional — leave blank to auto-create"
                      onChange={(productId, product) =>
                        applyProductToItem(item.key, productId, product)
                      }
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
                    <Label className="text-xs">Metal Type <RequiredMark /></Label>
                    <Select
                      value={item.metalTypeId}
                      onValueChange={(value) => updateItemMetal(item.key, value)}
                    >
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue placeholder="Select metal" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeMetals.map((metal) => (
                          <SelectItem key={metal.id} value={metal.id}>
                            {metal.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {hasPurity && (
                    <div className="space-y-1">
                      <Label className="text-xs">Purity</Label>
                      <Select
                        value={item.purity}
                        onValueChange={(value) => updateItem(item.key, { purity: value })}
                      >
                        <SelectTrigger className="h-11 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {purityOptionsForMetal(selectedMetal).map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs">Tag Number</Label>
                    <Input
                      value={item.tagNumber}
                      placeholder="TAG-001"
                      onChange={(e) => updateItem(item.key, { tagNumber: e.target.value })}
                    />
                  </div>
                </div>

                {/* ============================
                    WEIGHT DETAILS
                ============================ */}
                <div className="rounded-xl border p-4">
                  <h3 className="mb-4 text-sm font-semibold">Weight Details</h3>

                  <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Quantity</Label>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(item.key, { quantity: Number(e.target.value) || 1 })
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Gross Weight (g)</Label>
                      <Input
                        type="number"
                        step="0.00001"
                        value={item.grossWeight === 0 ? "" : item.grossWeight}
                        onChange={(e) => {
                          const grossWeight = Number(e.target.value) || 0
                          const derived = item.netTouched
                            ? null
                            : deriveNetWeight(
                                grossWeight,
                                item.lessWeight,
                                item.stoneWeight,
                                item.dmoWeight,
                              )
                          updateItem(item.key, {
                            grossWeight,
                            ...(derived !== null ? { netWeight: derived } : {}),
                          })
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Less Weight (g)</Label>
                      <Input
                        type="number"
                        step="0.00001"
                        value={item.lessWeight === 0 ? "" : item.lessWeight}
                        onChange={(e) => {
                          const lessWeight = Number(e.target.value) || 0
                          const derived = item.netTouched
                            ? null
                            : deriveNetWeight(
                                item.grossWeight,
                                lessWeight,
                                item.stoneWeight,
                                item.dmoWeight,
                              )
                          updateItem(item.key, {
                            lessWeight,
                            ...(derived !== null ? { netWeight: derived } : {}),
                          })
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Net Weight (g) <RequiredMark /></Label>
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
                        <p className="text-xs text-muted-foreground">
                          Gross − less − stone − dust/other
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Stone Weight (g)</Label>
                      <Input
                        type="number"
                        step="0.00001"
                        value={item.stoneWeight === 0 ? "" : item.stoneWeight}
                        onChange={(e) => {
                          const stoneWeight = Number(e.target.value) || 0
                          const derived = item.netTouched
                            ? null
                            : deriveNetWeight(
                                item.grossWeight,
                                item.lessWeight,
                                stoneWeight,
                                item.dmoWeight,
                              )
                          updateItem(item.key, {
                            stoneWeight,
                            ...(derived !== null ? { netWeight: derived } : {}),
                          })
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Dust/Making/Other Wt (g)</Label>
                      <Input
                        type="number"
                        step="0.00001"
                        value={item.dmoWeight === 0 ? "" : item.dmoWeight}
                        onChange={(e) => {
                          const dmoWeight = Number(e.target.value) || 0
                          const derived = item.netTouched
                            ? null
                            : deriveNetWeight(
                                item.grossWeight,
                                item.lessWeight,
                                item.stoneWeight,
                                dmoWeight,
                              )
                          updateItem(item.key, {
                            dmoWeight,
                            ...(derived !== null ? { netWeight: derived } : {}),
                          })
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Wastage %</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.wastagePercent === 0 ? "" : item.wastagePercent}
                        onChange={(e) =>
                          updateItem(item.key, {
                            wastagePercent: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Fine Weight (incl. wastage)</Label>
                      <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm font-medium">
                        {fineWeightOf(item).toFixed(3)}g
                      </div>
                    </div>
                  </div>
                </div>

                {/* ============================
                    PRICING & PURCHASE DETAILS
                ============================ */}
                <div className="rounded-xl border p-4">
                  <h3 className="mb-4 text-sm font-semibold">Pricing &amp; Purchase Details</h3>

                  <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Purchase Rate</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.purchaseRate === 0 ? "" : item.purchaseRate}
                        onChange={(e) =>
                          updateItem(item.key, { purchaseRate: Number(e.target.value) || 0 })
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Sale Rate</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.saleRate === 0 ? "" : item.saleRate}
                        onChange={(e) =>
                          updateItem(item.key, { saleRate: Number(e.target.value) || 0 })
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <MakingChargeInput
                        rate={item.purchaseRate}
                        netWeight={item.netWeight}
                        value={item.makingCharge}
                        onChange={(value) => updateItem(item.key, { makingCharge: value })}
                        chargeType={item.makingChargeType}
                        onChargeTypeChange={(type) =>
                          updateItem(item.key, { makingChargeType: type })
                        }
                        label="Making Charge"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Stone Charge</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.stoneCharge === 0 ? "" : item.stoneCharge}
                        onChange={(e) =>
                          updateItem(item.key, { stoneCharge: Number(e.target.value) || 0 })
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Other Charge</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.otherCharge === 0 ? "" : item.otherCharge}
                        onChange={(e) =>
                          updateItem(item.key, { otherCharge: Number(e.target.value) || 0 })
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Purchase Amount</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.purchaseAmount === 0 ? "" : item.purchaseAmount}
                        onChange={(e) =>
                          updateItem(item.key, { purchaseAmount: Number(e.target.value) || 0 })
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Sale Amount</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.saleAmount === 0 ? "" : item.saleAmount}
                        onChange={(e) =>
                          updateItem(item.key, { saleAmount: Number(e.target.value) || 0 })
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Purchase Date</Label>
                      <Input
                        type="date"
                        value={item.purchaseDate}
                        onChange={(e) => updateItem(item.key, { purchaseDate: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Date of Manufacture</Label>
                      <Input
                        type="date"
                        value={item.manufactureDate}
                        onChange={(e) =>
                          updateItem(item.key, { manufactureDate: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Location</Label>
                      <LocationSelect
                        locations={locations}
                        defaultValue={item.locationId}
                        onChange={(locationId) => updateItem(item.key, { locationId })}
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-1">
                    <Label className="text-xs">Remarks</Label>
                    <Textarea
                      rows={3}
                      value={item.remarks}
                      onChange={(e) => updateItem(item.key, { remarks: e.target.value })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="max-w-xs">
            <MakingChargeInput
              rate={totalMetalValue}
              netWeight={1}
              value={labourCharge}
              onChange={setLabourCharge}
              label="Labour Charge"
            />
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Total Net Weight</span>
              <span>{totalNetWeight.toFixed(3)}g</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total Fine Weight (incl. wastage)</span>
              <span>{totalFineWeight.toFixed(3)}g</span>
            </div>
            <div className="flex justify-between">
              <span>Labour Charge</span>
              <span>₹{labourCharge.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 border-t pt-6">
        <Link href={`/karigars/${karigarId}`}>
          <Button type="button" variant="outline" disabled={pending}>
            Cancel
          </Button>
        </Link>
        <Button type="submit" disabled={pending || !canSubmit}>
          {pending ? "Saving..." : "Receive Items"}
        </Button>
      </div>
    </form>
  )
}
