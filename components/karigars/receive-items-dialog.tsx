"use client"

import { useEffect, useMemo, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"

import {
  receiveItemsFromKarigar,
  type StockActionState,
} from "@/lib/actions/inventory-stock-actions"
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions"
import { useToast } from "@/components/providers/toast-provider"
import { ProductSelect, type ProductOption } from "@/components/inventory/shared/product-select"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  stoneCharge: number
  otherCharge: number
  purchaseAmount: number
  saleAmount: number
  vendorName: string
  purchaseDate: string
  manufactureDate: string
  location: string
  remarks: string
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
    purity: defaultMetal && !defaultMetal.hasPurity ? "OTHER" : "GOLD_22K",
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
    stoneCharge: 0,
    otherCharge: 0,
    purchaseAmount: 0,
    saleAmount: 0,
    vendorName: "",
    purchaseDate: "",
    manufactureDate: "",
    location: "",
    remarks: "",
  }
}

type ReceiveItemsDialogProps = {
  jobId: string
  products: ProductOption[]
  fineness: Record<string, number>
  metals: StoreMetalRow[]
}

export function ReceiveItemsDialog({ jobId, products, fineness, metals }: ReceiveItemsDialogProps) {
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

  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ReceiptItem[]>([emptyReceiptItem(defaultMetal)])
  const [labourCharge, setLabourCharge] = useState(0)
  const router = useRouter()
  const toast = useToast()

  const receiveItemsWithId = receiveItemsFromKarigar.bind(null, jobId)
  const [state, formAction, pending] = useActionState(receiveItemsWithId, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Items received")
      setOpen(false)
      router.refresh()
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const updateItem = (key: string, patch: Partial<ReceiptItem>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  const updateItemMetal = (key: string, metalTypeId: string) => {
    const metal = metalById.get(metalTypeId)
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item
        if (!metal || metal.hasPurity) {
          // Switching into (or staying in) a hasPurity metal: drop the
          // "OTHER" sentinel back to a real purity if it was set.
          return {
            ...item,
            metalTypeId,
            purity: item.purity === "OTHER" ? "GOLD_22K" : item.purity,
          }
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

  const totalNetWeight = useMemo(
    () => items.reduce((sum, item) => sum + (item.netWeight || 0), 0),
    [items],
  )
  const totalFineWeight = useMemo(
    () => items.reduce((sum, item) => sum + fineWeightOf(item), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, fineness],
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
      stoneCharge: item.stoneCharge || null,
      otherCharge: item.otherCharge || null,
      purchaseAmount: item.purchaseAmount || null,
      saleAmount: item.saleAmount || null,
      vendorName: item.vendorName || null,
      purchaseDate: item.purchaseDate || null,
      manufactureDate: item.manufactureDate || null,
      location: item.location || null,
      remarks: item.remarks || null,
    })),
  )

  const canSubmit = items.every(
    (item) => item.productId && item.netWeight > 0 && item.metalTypeId,
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Receive Items
      </Button>

      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive Items from Karigar</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="itemsJson" value={itemsJson} />
          <input type="hidden" name="labourCharge" value={labourCharge} />

          {!state.success && state.message && (
            <div className="text-sm text-red-600">{state.message}</div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Returned Items</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems((prev) => [...prev, emptyReceiptItem(defaultMetal)])}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item) => {
                const selectedMetal = metalById.get(item.metalTypeId)
                const hasPurity = selectedMetal?.hasPurity ?? true

                return (
                  <div key={item.key} className="rounded-lg border p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Product *</Label>
                        <ProductSelect
                          products={products}
                          name={`product-${item.key}`}
                          defaultValue={item.productId}
                          placeholder="Select product"
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
                        <Label className="text-xs">Metal Type</Label>
                        <Select
                          value={item.metalTypeId}
                          onValueChange={(value) => updateItemMetal(item.key, value)}
                        >
                          <SelectTrigger>
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
                            <SelectTrigger>
                              <SelectValue />
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
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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
                          step="0.001"
                          value={item.grossWeight === 0 ? "" : item.grossWeight}
                          onChange={(e) =>
                            updateItem(item.key, { grossWeight: Number(e.target.value) || 0 })
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Less Weight (g)</Label>
                        <Input
                          type="number"
                          step="0.001"
                          value={item.lessWeight === 0 ? "" : item.lessWeight}
                          onChange={(e) =>
                            updateItem(item.key, { lessWeight: Number(e.target.value) || 0 })
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Net Weight (g) *</Label>
                        <Input
                          type="number"
                          step="0.001"
                          value={item.netWeight === 0 ? "" : item.netWeight}
                          onChange={(e) =>
                            updateItem(item.key, { netWeight: Number(e.target.value) || 0 })
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Stone Weight (g)</Label>
                        <Input
                          type="number"
                          step="0.001"
                          value={item.stoneWeight === 0 ? "" : item.stoneWeight}
                          onChange={(e) =>
                            updateItem(item.key, { stoneWeight: Number(e.target.value) || 0 })
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Dust/Making/Other Wt (g)</Label>
                        <Input
                          type="number"
                          step="0.001"
                          value={item.dmoWeight === 0 ? "" : item.dmoWeight}
                          onChange={(e) =>
                            updateItem(item.key, { dmoWeight: Number(e.target.value) || 0 })
                          }
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

                    <div className="space-y-2 border-t pt-3">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Pricing &amp; Purchase Details
                      </Label>

                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Tag Number</Label>
                          <Input
                            value={item.tagNumber}
                            placeholder="TAG-001"
                            onChange={(e) => updateItem(item.key, { tagNumber: e.target.value })}
                          />
                        </div>

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
                          <Label className="text-xs">Making Charge</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.makingCharge === 0 ? "" : item.makingCharge}
                            onChange={(e) =>
                              updateItem(item.key, { makingCharge: Number(e.target.value) || 0 })
                            }
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
                          <Label className="text-xs">Vendor Name</Label>
                          <Input
                            value={item.vendorName}
                            onChange={(e) => updateItem(item.key, { vendorName: e.target.value })}
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Purchase Date</Label>
                          <Input
                            type="date"
                            value={item.purchaseDate}
                            onChange={(e) =>
                              updateItem(item.key, { purchaseDate: e.target.value })
                            }
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
                          <Input
                            value={item.location}
                            placeholder="Store / Locker"
                            onChange={(e) => updateItem(item.key, { location: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Remarks</Label>
                        <Textarea
                          rows={2}
                          value={item.remarks}
                          onChange={(e) => updateItem(item.key, { remarks: e.target.value })}
                        />
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
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Labour Charge</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={labourCharge === 0 ? "" : labourCharge}
              onChange={(e) => setLabourCharge(Number(e.target.value) || 0)}
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !canSubmit}>
              {pending ? "Saving..." : "Receive Items"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
