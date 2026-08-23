"use client"

import { useEffect, useMemo, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"

import {
  receiveItemsFromKarigar,
  type StockActionState,
} from "@/lib/actions/inventory-stock-actions"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const initialState: StockActionState = { success: false, message: "" }

const PURITY_OPTIONS: { value: string; label: string }[] = [
  { value: "GOLD_24K", label: "Gold 24K" },
  { value: "GOLD_22K", label: "Gold 22K" },
  { value: "GOLD_20K", label: "Gold 20K" },
  { value: "GOLD_18K", label: "Gold 18K" },
  { value: "SILVER_999", label: "Silver 999" },
  { value: "SILVER_925", label: "Silver 925" },
  { value: "OTHER", label: "Other" },
]

type ReceiptItem = {
  key: string
  itemName: string
  productId: string
  metalType: string
  purity: string
  quantity: number
  grossWeight: number
  netWeight: number
  stoneWeight: number
  dmoWeight: number
  wastagePercent: number
}

function emptyReceiptItem(): ReceiptItem {
  return {
    key: crypto.randomUUID(),
    itemName: "",
    productId: "",
    metalType: "GOLD",
    purity: "GOLD_22K",
    quantity: 1,
    grossWeight: 0,
    netWeight: 0,
    stoneWeight: 0,
    dmoWeight: 0,
    wastagePercent: 0,
  }
}

type ReceiveItemsDialogProps = {
  jobId: string
  products: ProductOption[]
  fineness: Record<string, number>
}

export function ReceiveItemsDialog({ jobId, products, fineness }: ReceiveItemsDialogProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ReceiptItem[]>([emptyReceiptItem()])
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

  const applyProductToItem = (key: string, productId: string, product: ProductOption | undefined) => {
    if (!product) {
      updateItem(key, { productId: "" })
      return
    }

    updateItem(key, {
      productId,
      itemName: product.name,
      metalType: product.metalType ?? "GOLD",
      purity: product.defaultPurity ?? "GOLD_22K",
    })
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
      metalType: item.metalType,
      purity: item.purity,
      quantity: item.quantity || 1,
      grossWeight: item.grossWeight || null,
      netWeight: item.netWeight || null,
      stoneWeight: item.stoneWeight || null,
      dmoWeight: item.dmoWeight || null,
      wastagePercent: item.wastagePercent || null,
    })),
  )

  const canSubmit = items.every((item) => item.productId && item.netWeight > 0)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Receive Items
      </Button>

      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
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
                onClick={() => setItems((prev) => [...prev, emptyReceiptItem()])}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.key} className="rounded-lg border p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
