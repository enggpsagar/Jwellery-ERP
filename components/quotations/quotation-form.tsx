"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useActionState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { createQuotation, type QuotationFormState } from "@/lib/actions/quotation-actions"
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
import { LocationSelect } from "@/components/shared/location-select"
import { RequiredMark } from "@/components/shared/required-mark"

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
  netWeight: number | null
  saleRate: number | null
}

type LineItem = {
  key: string
  itemName: string
  metalTypeId: string
  purity: string
  quantity: number
  grossWeight: number
  netWeight: number
  rate: number
  makingCharge: number
  makingChargeType: "FIXED" | "PERCENTAGE"
  stoneCharge: number
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
    rate: 0,
    makingCharge: 0,
    makingChargeType: "FIXED",
    stoneCharge: 0,
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
}

export function QuotationForm({ customers, stockItems, locations = [] }: QuotationFormProps) {
  const router = useRouter()
  const toast = useToast()

  const [customerId, setCustomerId] = useState("")
  const [locationId, setLocationId] = useState("")
  const [items, setItems] = useState<LineItem[]>([emptyLineItem()])
  const [discount, setDiscount] = useState(0)
  const [taxAmount, setTaxAmount] = useState(0)

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

  const applyStockToItem = (key: string, stockId: string) => {
    const stock = stockItems.find((s) => s.id === stockId)
    if (!stock) {
      updateItem(key, { inventoryStockId: "" })
      return
    }

    updateItem(key, {
      inventoryStockId: stockId,
      itemName: stock.productName,
      metalTypeId: stock.metalType?.id ?? "",
      purity: stock.purity ?? "",
      netWeight: stock.netWeight ?? 0,
      rate: stock.saleRate ?? 0,
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

  const itemsJson = JSON.stringify(
    items.map((item) => ({
      itemName: item.itemName || "Item",
      metalTypeId: item.metalTypeId || null,
      purity: item.purity || null,
      quantity: item.quantity || 1,
      grossWeight: item.grossWeight || null,
      netWeight: item.netWeight || null,
      rate: item.rate || null,
      makingCharge: item.makingCharge,
      makingChargeType: item.makingChargeType,
      stoneCharge: item.stoneCharge,
      inventoryStockId: item.inventoryStockId || null,
    })),
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
          <Label>Quotation Date</Label>
          <Input
            type="date"
            name="quotationDate"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>

        <div className="space-y-2">
          <Label>Valid Until</Label>
          <Input type="date" name="validUntil" />
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
                      {stockItems.map((stock) => (
                        <SelectItem key={stock.id} value={stock.id}>
                          {stock.stockCode} — {stock.productName}
                        </SelectItem>
                      ))}
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
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(item.key, { quantity: Number(e.target.value) || 1 })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </div>

      <Button type="submit" disabled={pending || !customerId}>
        {pending ? "Creating..." : "Create Quotation"}
      </Button>
    </form>
  )
}
