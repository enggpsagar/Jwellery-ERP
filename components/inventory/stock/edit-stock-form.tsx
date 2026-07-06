"use client"

import { useEffect } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"

import { updateInventoryStock } from "@/lib/actions/inventory/stock-actions"
import {
  initialStockFormState,
  type StockFormState,
} from "@/lib/inventory/stock-types"

type ProductOption = {
  id: string
  productCode: string
  name: string
  category: string
  ornamentType: string | null
  metalType: string
  defaultPurity: string | null
  defaultMakingCharge?: string | null
  defaultStoneCharge?: string | null
  designCode?: string | null
  hsnCode?: string | null
  description?: string | null
  notes?: string | null
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

type StockData = {
  id: string
  stockCode: string
  tagNumber?: string | null
  productId: string
  metalType: string
  purity?: string | null
  quantity: number
  status: string
  isActive: boolean
  grossWeight?: string | null
  lessWeight?: string | null
  netWeight?: string | null
  stoneWeight?: string | null
  wastagePercent?: string | null
  purchaseRate?: string | null
  saleRate?: string | null
  makingCharge?: string | null
  stoneCharge?: string | null
  otherCharge?: string | null
  purchaseAmount?: string | null
  saleAmount?: string | null
  vendorName?: string | null
  purchaseDate?: string | null
  location?: string | null
  remarks?: string | null
}

type EditStockFormProps = {
  stock: StockData
  products: ProductOption[]
}

export function EditStockForm({ stock, products }: EditStockFormProps) {
  const router = useRouter()

  const updateStockAction = updateInventoryStock.bind(null, stock.id)
  const [state, formAction, pending] = useActionState<StockFormState, FormData>(
    updateStockAction,
    initialStockFormState
  )

useEffect(() => {
  if (state.success) {
    const message = encodeURIComponent(
      state.message || "Stock updated successfully"
    )

    router.push(`/inventory/stock/${stock.id}?success=${message}`)
    router.refresh()
  }
}, [state.success, state.message, router, stock.id])

  return (
    <form action={formAction} className="space-y-6 rounded-xl border bg-white p-6">
      {state.message ? (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            state.success
              ? "border border-green-200 bg-green-50 text-green-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="stockCode" className="text-sm font-medium">
            Stock Code <span className="text-red-500">*</span>
          </label>
          <input
            id="stockCode"
            name="stockCode"
            defaultValue={stock.stockCode}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          {state.errors?.stockCode?.[0] ? (
            <p className="text-sm text-red-600">{state.errors.stockCode[0]}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="tagNumber" className="text-sm font-medium">
            Tag Number
          </label>
          <input
            id="tagNumber"
            name="tagNumber"
            defaultValue={stock.tagNumber ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="productId" className="text-sm font-medium">
            Product <span className="text-red-500">*</span>
          </label>
          <select
            id="productId"
            name="productId"
            defaultValue={stock.productId}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.productCode} — {product.name}
              </option>
            ))}
          </select>
          {state.errors?.productId?.[0] ? (
            <p className="text-sm text-red-600">{state.errors.productId[0]}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="quantity" className="text-sm font-medium">
            Quantity <span className="text-red-500">*</span>
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min="1"
            defaultValue={stock.quantity}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="metalType" className="text-sm font-medium">
            Metal Type <span className="text-red-500">*</span>
          </label>
          <select
            id="metalType"
            name="metalType"
            defaultValue={stock.metalType}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="GOLD">GOLD</option>
            <option value="SILVER">SILVER</option>
            <option value="OTHER">OTHER</option>
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="purity" className="text-sm font-medium">
            Purity
          </label>
          <select
            id="purity"
            name="purity"
            defaultValue={stock.purity ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Select purity</option>
            <option value="GOLD_18K">GOLD_18K</option>
            <option value="GOLD_20K">GOLD_20K</option>
            <option value="GOLD_22K">GOLD_22K</option>
            <option value="GOLD_24K">GOLD_24K</option>
            <option value="SILVER_925">SILVER_925</option>
            <option value="SILVER_999">SILVER_999</option>
            <option value="OTHER">OTHER</option>
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="status" className="text-sm font-medium">
            Status <span className="text-red-500">*</span>
          </label>
          <select
            id="status"
            name="status"
            defaultValue={stock.status}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="IN_STOCK">IN_STOCK</option>
            <option value="SOLD">SOLD</option>
            <option value="RESERVED">RESERVED</option>
            <option value="ISSUED_TO_KARIGAR">ISSUED_TO_KARIGAR</option>
            <option value="DAMAGED">DAMAGED</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="grossWeight" className="text-sm font-medium">
            Gross Weight
          </label>
          <input
            id="grossWeight"
            name="grossWeight"
            defaultValue={stock.grossWeight ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="lessWeight" className="text-sm font-medium">
            Less Weight
          </label>
          <input
            id="lessWeight"
            name="lessWeight"
            defaultValue={stock.lessWeight ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="netWeight" className="text-sm font-medium">
            Net Weight
          </label>
          <input
            id="netWeight"
            name="netWeight"
            defaultValue={stock.netWeight ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="stoneWeight" className="text-sm font-medium">
            Stone Weight
          </label>
          <input
            id="stoneWeight"
            name="stoneWeight"
            defaultValue={stock.stoneWeight ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="wastagePercent" className="text-sm font-medium">
            Wastage %
          </label>
          <input
            id="wastagePercent"
            name="wastagePercent"
            defaultValue={stock.wastagePercent ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="purchaseRate" className="text-sm font-medium">
            Purchase Rate
          </label>
          <input
            id="purchaseRate"
            name="purchaseRate"
            defaultValue={stock.purchaseRate ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="saleRate" className="text-sm font-medium">
            Sale Rate
          </label>
          <input
            id="saleRate"
            name="saleRate"
            defaultValue={stock.saleRate ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="makingCharge" className="text-sm font-medium">
            Making Charge
          </label>
          <input
            id="makingCharge"
            name="makingCharge"
            defaultValue={stock.makingCharge ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="stoneCharge" className="text-sm font-medium">
            Stone Charge
          </label>
          <input
            id="stoneCharge"
            name="stoneCharge"
            defaultValue={stock.stoneCharge ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="otherCharge" className="text-sm font-medium">
            Other Charge
          </label>
          <input
            id="otherCharge"
            name="otherCharge"
            defaultValue={stock.otherCharge ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="purchaseAmount" className="text-sm font-medium">
            Purchase Amount
          </label>
          <input
            id="purchaseAmount"
            name="purchaseAmount"
            defaultValue={stock.purchaseAmount ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="saleAmount" className="text-sm font-medium">
            Sale Amount
          </label>
          <input
            id="saleAmount"
            name="saleAmount"
            defaultValue={stock.saleAmount ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="vendorName" className="text-sm font-medium">
            Vendor Name
          </label>
          <input
            id="vendorName"
            name="vendorName"
            defaultValue={stock.vendorName ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
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
            defaultValue={stock.purchaseDate ? stock.purchaseDate.slice(0, 10) : ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="location" className="text-sm font-medium">
            Location
          </label>
          <input
            id="location"
            name="location"
            defaultValue={stock.location ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label htmlFor="remarks" className="text-sm font-medium">
            Remarks
          </label>
          <textarea
            id="remarks"
            name="remarks"
            defaultValue={stock.remarks ?? ""}
            rows={4}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="isActive"
            name="isActive"
            type="checkbox"
            value="true"
            defaultChecked={stock.isActive}
            className="h-4 w-4 rounded border"
          />
          <label htmlFor="isActive" className="text-sm font-medium">
            Active
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving..." : "Update Stock"}
        </button>
      </div>
    </form>
  )
}