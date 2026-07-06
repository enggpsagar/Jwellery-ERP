"use client"

import { useEffect, useState, useTransition } from "react"
import { Plus } from "lucide-react"

import { createInventoryStock } from "@/lib/actions/inventory/stock-actions"
import {
  initialStockFormState,
  type StockFormState,
} from "@/lib/inventory/stock-types"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type ProductOption = {
  id: string
  productCode: string
  name: string
}

type AddStockDialogProps = {
  products?: ProductOption[]
}

export function AddStockDialog({
  products = [],
}: AddStockDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<StockFormState>(initialStockFormState)

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createInventoryStock(state, formData)
      setState(result)

      if (result.success) {
        setOpen(false)
        setState(initialStockFormState)
      }
    })
  }

  useEffect(() => {
    if (state.success && open) {
      setOpen(false)
    }
  }, [state.success, open])

  return (
    <>
      <Button type="button" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add Stock
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add Stock Item</DialogTitle>
            <DialogDescription>
              Create a physical stock entry for a jewellery product.
            </DialogDescription>
          </DialogHeader>

          <form action={handleSubmit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="stockCode" className="text-sm font-medium">
                  Stock Code <span className="text-red-500">*</span>
                </label>
                <input
                  id="stockCode"
                  name="stockCode"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="STK-0001"
                  required
                />
                {state.errors?.stockCode?.[0] ? (
                  <p className="text-sm text-red-600">
                    {state.errors.stockCode[0]}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="tagNumber" className="text-sm font-medium">
                  Tag Number
                </label>
                <input
                  id="tagNumber"
                  name="tagNumber"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Optional tag number"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="productId" className="text-sm font-medium">
                  Product <span className="text-red-500">*</span>
                </label>
                <select
                  id="productId"
                  name="productId"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select product
                  </option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.productCode} — {product.name}
                    </option>
                  ))}
                </select>
                {state.errors?.productId?.[0] ? (
                  <p className="text-sm text-red-600">
                    {state.errors.productId[0]}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="metalType" className="text-sm font-medium">
                  Metal Type
                </label>
                <select
                  id="metalType"
                  name="metalType"
                  defaultValue="GOLD"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="GOLD">Gold</option>
                  <option value="SILVER">Silver</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="purity" className="text-sm font-medium">
                  Purity
                </label>
                <select
                  id="purity"
                  name="purity"
                  defaultValue=""
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Select purity</option>
                  <option value="GOLD_18K">18K Gold</option>
                  <option value="GOLD_20K">20K Gold</option>
                  <option value="GOLD_22K">22K Gold</option>
                  <option value="GOLD_24K">24K Gold</option>
                  <option value="SILVER_925">Silver 925</option>
                  <option value="SILVER_999">Silver 999</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="quantity" className="text-sm font-medium">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min={1}
                  defaultValue={1}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required
                />
                {state.errors?.quantity?.[0] ? (
                  <p className="text-sm text-red-600">
                    {state.errors.quantity[0]}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="status" className="text-sm font-medium">
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  defaultValue="IN_STOCK"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="IN_STOCK">In Stock</option>
                  <option value="RESERVED">Reserved</option>
                  <option value="SOLD">Sold</option>
                  <option value="ISSUED_TO_KARIGAR">Issued to Karigar</option>
                  <option value="DAMAGED">Damaged</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="grossWeight" className="text-sm font-medium">
                  Gross Weight
                </label>
                <input
                  id="grossWeight"
                  name="grossWeight"
                  type="number"
                  step="0.001"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="0.000"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="lessWeight" className="text-sm font-medium">
                  Less Weight
                </label>
                <input
                  id="lessWeight"
                  name="lessWeight"
                  type="number"
                  step="0.001"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="0.000"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="netWeight" className="text-sm font-medium">
                  Net Weight
                </label>
                <input
                  id="netWeight"
                  name="netWeight"
                  type="number"
                  step="0.001"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="0.000"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="stoneWeight" className="text-sm font-medium">
                  Stone Weight
                </label>
                <input
                  id="stoneWeight"
                  name="stoneWeight"
                  type="number"
                  step="0.001"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="0.000"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="purchaseRate" className="text-sm font-medium">
                  Purchase Rate
                </label>
                <input
                  id="purchaseRate"
                  name="purchaseRate"
                  type="number"
                  step="0.01"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="saleRate" className="text-sm font-medium">
                  Sale Rate
                </label>
                <input
                  id="saleRate"
                  name="saleRate"
                  type="number"
                  step="0.01"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="makingCharge" className="text-sm font-medium">
                  Making Charge
                </label>
                <input
                  id="makingCharge"
                  name="makingCharge"
                  type="number"
                  step="0.01"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="stoneCharge" className="text-sm font-medium">
                  Stone Charge
                </label>
                <input
                  id="stoneCharge"
                  name="stoneCharge"
                  type="number"
                  step="0.01"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="vendorName" className="text-sm font-medium">
                  Vendor Name
                </label>
                <input
                  id="vendorName"
                  name="vendorName"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Vendor / supplier"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="purchaseDate" className="text-sm font-medium">
                  Purchase Date
                </label>
                <input
                  id="purchaseDate"
                  name="purchaseDate"
                  type="date"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="location" className="text-sm font-medium">
                  Location
                </label>
                <input
                  id="location"
                  name="location"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Shelf / locker / branch"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="remarks" className="text-sm font-medium">
                  Remarks
                </label>
                <textarea
                  id="remarks"
                  name="remarks"
                  rows={3}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Optional notes"
                />
              </div>

              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  id="isActive"
                  name="isActive"
                  type="checkbox"
                  value="true"
                  defaultChecked
                  className="h-4 w-4 rounded border"
                />
                <label htmlFor="isActive" className="text-sm font-medium">
                  Active stock item
                </label>
              </div>
            </div>

            {state.message ? (
              <div
                className={`rounded-md border px-3 py-2 text-sm ${
                  state.success
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {state.message}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false)
                  setState(initialStockFormState)
                }}
              >
                Cancel
              </Button>

              <Button type="submit" formAction={handleSubmit} disabled={isPending}>
                {isPending ? "Saving..." : "Save Stock"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}