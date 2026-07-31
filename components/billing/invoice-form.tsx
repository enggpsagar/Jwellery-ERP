"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useActionState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { createInvoice, type InvoiceFormState } from "@/lib/actions/invoice-actions"
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
  metalType: string
  purity: string | null
  netWeight: number | null
  saleRate: number | null
}

type LineItem = {
  key: string
  itemName: string
  metalType: string
  purity: string
  quantity: number
  grossWeight: number
  netWeight: number
  rate: number
  makingCharge: number
  stoneCharge: number
  inventoryStockId: string
}

function emptyLineItem(): LineItem {
  return {
    key: crypto.randomUUID(),
    itemName: "",
    metalType: "GOLD",
    purity: "",
    quantity: 1,
    grossWeight: 0,
    netWeight: 0,
    rate: 0,
    makingCharge: 0,
    stoneCharge: 0,
    inventoryStockId: "",
  }
}

const initialState: InvoiceFormState = { success: false, message: "" }

type InvoiceFormProps = {
  customers: CustomerOption[]
  stockItems: StockOption[]
}

export function InvoiceForm({ customers, stockItems }: InvoiceFormProps) {
  const router = useRouter()
  const toast = useToast()

  const [customerId, setCustomerId] = useState("")
  const [items, setItems] = useState<LineItem[]>([emptyLineItem()])
  const [discount, setDiscount] = useState(0)
  const [taxAmount, setTaxAmount] = useState(0)
  const [paidAmount, setPaidAmount] = useState(0)

  const [state, formAction, pending] = useActionState(
    createInvoice,
    initialState,
  )

  useEffect(() => {
    if (state.success && state.invoiceId) {
      toast.success(state.message || "Invoice created")
      router.push(`/billing/${state.invoiceId}`)
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
      metalType: stock.metalType,
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
  const balanceAmount = Math.max(0, totalAmount - paidAmount)

  const itemsJson = JSON.stringify(
    items.map((item) => ({
      itemName: item.itemName || "Item",
      metalType: item.metalType || null,
      purity: item.purity || null,
      quantity: item.quantity || 1,
      grossWeight: item.grossWeight || null,
      netWeight: item.netWeight || null,
      rate: item.rate || null,
      makingCharge: item.makingCharge,
      stoneCharge: item.stoneCharge,
      inventoryStockId: item.inventoryStockId || null,
    })),
  )

  return (
    <form
      action={formAction}
      onSubmit={() => {
        if (state.success) return
      }}
      className="space-y-6"
    >
      <input type="hidden" name="itemsJson" value={itemsJson} />
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="discount" value={discount} />
      <input type="hidden" name="taxAmount" value={taxAmount} />
      <input type="hidden" name="paidAmount" value={paidAmount} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label>Customer *</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a customer" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.name} {customer.phone ? `(${customer.phone})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Invoice Date</Label>
          <Input
            type="date"
            name="invoiceDate"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>

        <div className="space-y-2">
          <Label>Due Date</Label>
          <Input type="date" name="dueDate" />
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
                    value={item.netWeight}
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
                    value={item.rate}
                    onChange={(e) =>
                      updateItem(item.key, { rate: Number(e.target.value) || 0 })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Making Charge</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={item.makingCharge}
                    onChange={(e) =>
                      updateItem(item.key, {
                        makingCharge: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Stone Charge</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={item.stoneCharge}
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
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value) || 0)}
          />
        </div>

        <div className="space-y-2">
          <Label>Tax Amount</Label>
          <Input
            type="number"
            step="0.01"
            value={taxAmount}
            onChange={(e) => setTaxAmount(Number(e.target.value) || 0)}
          />
        </div>

        <div className="space-y-2">
          <Label>Paid Now</Label>
          <Input
            type="number"
            step="0.01"
            value={paidAmount}
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

      <Button type="submit" disabled={pending || !customerId}>
        {pending ? "Creating..." : "Create Invoice"}
      </Button>
    </form>
  )
}
