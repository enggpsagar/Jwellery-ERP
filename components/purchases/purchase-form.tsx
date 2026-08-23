"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useActionState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { createPurchase, type PurchaseFormState } from "@/lib/actions/purchase-actions"
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
import { MakingChargeInput } from "@/components/shared/making-charge-input"

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
  metalType: string | null
  defaultPurity: string | null
  defaultMakingCharge: number | null
  defaultStoneCharge: number | null
  isActive: boolean
}

type LineItem = {
  key: string
  productId: string
  itemName: string
  metalType: string
  purity: string
  quantity: number
  grossWeight: number
  netWeight: number
  rate: number
  makingCharge: number
  stoneCharge: number
  dmoWeight: number
}

const PURITY_OPTIONS = [
  { value: "GOLD_24K", label: "24K Gold" },
  { value: "GOLD_22K", label: "22K Gold" },
  { value: "GOLD_20K", label: "20K Gold" },
  { value: "GOLD_18K", label: "18K Gold" },
  { value: "SILVER_999", label: "Silver 999" },
  { value: "SILVER_925", label: "Silver 925" },
  { value: "OTHER", label: "Other" },
]

function emptyLineItem(): LineItem {
  return {
    key: crypto.randomUUID(),
    productId: "",
    itemName: "",
    metalType: "GOLD",
    purity: "",
    quantity: 1,
    grossWeight: 0,
    netWeight: 0,
    rate: 0,
    makingCharge: 0,
    stoneCharge: 0,
    dmoWeight: 0,
  }
}

const initialState: PurchaseFormState = { success: false, message: "" }

type PurchaseFormProps = {
  vendors: VendorOption[]
  products: ProductOption[]
}

export function PurchaseForm({ vendors, products }: PurchaseFormProps) {
  const router = useRouter()
  const toast = useToast()

  const [vendorId, setVendorId] = useState("")
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

  const updateItem = (key: string, patch: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    )
  }

  const applyProductToItem = (key: string, productId: string) => {
    const product = products.find((p) => p.id === productId)
    if (!product) {
      updateItem(key, { productId: "" })
      return
    }

    updateItem(key, {
      productId,
      itemName: product.name,
      metalType: product.metalType ?? "GOLD",
      purity: product.defaultPurity ?? "",
      makingCharge: product.defaultMakingCharge ?? 0,
      stoneCharge: product.defaultStoneCharge ?? 0,
    })
  }

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev))
  }

  const lineTotal = (item: LineItem) =>
    item.rate * item.netWeight + item.makingCharge + item.stoneCharge

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.rate * item.netWeight, 0),
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
      metalType: item.metalType || null,
      purity: item.purity || null,
      quantity: item.quantity || 1,
      grossWeight: item.grossWeight || null,
      netWeight: item.netWeight || null,
      rate: item.rate || null,
      makingCharge: item.makingCharge,
      stoneCharge: item.stoneCharge,
      dmoWeight: item.dmoWeight || null,
    })),
  )

  const canSubmit = vendorId && items.every((item) => item.productId)

  return (
    <form
      action={formAction}
      onSubmit={() => {
        if (state.success) return
      }}
      className="space-y-6"
    >
      <input type="hidden" name="itemsJson" value={itemsJson} />
      <input type="hidden" name="discount" value={discount} />
      <input type="hidden" name="taxAmount" value={taxAmount} />
      <input type="hidden" name="paidAmount" value={paidAmount} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label>Vendor *</Label>
          <VendorSelect
            vendors={vendors}
            name="vendorId"
            defaultValue={vendorId}
            onChange={(id) => setVendorId(id)}
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
                  <Label className="text-xs">Product *</Label>
                  <ProductSelect
                    products={products}
                    name={`product-${item.key}`}
                    defaultValue={item.productId}
                    onChange={(productId) => applyProductToItem(item.key, productId)}
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
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(item.key, { quantity: Number(e.target.value) || 1 })
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
                    step="0.001"
                    value={item.grossWeight === 0 ? "" : item.grossWeight}
                    onChange={(e) =>
                      updateItem(item.key, { grossWeight: Number(e.target.value) || 0 })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Net Weight (g)</Label>
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
