// components/inventory/products/edit-product-form.tsx
"use client"

import { useActionState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  InventoryCategory,
  MetalType,
  OrnamentType,
  PurityType,
} from "@prisma/client"

import { updateProduct } from "@/lib/actions/inventory/product-actions"
import {
  initialProductFormState,
  type ProductFormState,
} from "@/lib/inventory/product-types"

type EditProductFormProps = {
  product: {
    id: string
    productCode: string
    name: string
    category: string
    ornamentType: string | null
    metalType: string
    defaultPurity: string | null
    defaultMakingCharge: string | null
    defaultStoneCharge: string | null
    designCode: string | null
    hsnCode: string | null
    description: string | null
    notes: string | null
    isActive: boolean
    createdAt: string
    updatedAt: string
  }
}

function FieldError({ error }: { error?: string[] }) {
  if (!error?.length) return null
  return <p className="mt-1 text-xs text-red-600">{error[0]}</p>
}

export function EditProductForm({ product }: EditProductFormProps) {
  const router = useRouter()

  const updateAction = useMemo(() => {
    return updateProduct.bind(null, product.id)
  }, [product.id])

  const [state, formAction, pending] = useActionState<
    ProductFormState,
    FormData
  >(updateAction, initialProductFormState)

  useEffect(() => {
    if (state.success) {
      router.push("/inventory/products")
      router.refresh()
    }
  }, [state.success, router])

  return (
    <form action={formAction} className="space-y-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-semibold">Product Details</h2>
          <p className="text-sm text-muted-foreground">
            Update the product master used for jewellery inventory stock.
          </p>
        </div>

        {state?.message && !state.success && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.message}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label
              htmlFor="productCode"
              className="mb-2 block text-sm font-medium"
            >
              Product Code <span className="text-red-500">*</span>
            </label>
            <input
              id="productCode"
              name="productCode"
              defaultValue={product.productCode}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-black"
              placeholder="PRD-0001"
            />
            <FieldError error={state.errors?.productCode} />
          </div>

          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-medium">
              Product Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              name="name"
              defaultValue={product.name}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-black"
              placeholder="22K Ladies Ring"
            />
            <FieldError error={state.errors?.name} />
          </div>

          <div>
            <label
              htmlFor="category"
              className="mb-2 block text-sm font-medium"
            >
              Category
            </label>
            <select
              id="category"
              name="category"
              defaultValue={product.category}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-black"
            >
              {Object.values(InventoryCategory).map((category) => (
                <option key={category} value={category}>
                  {category.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="ornamentType"
              className="mb-2 block text-sm font-medium"
            >
              Ornament Type
            </label>
            <select
              id="ornamentType"
              name="ornamentType"
              defaultValue={product.ornamentType ?? ""}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-black"
            >
              <option value="">Select ornament type</option>
              {Object.values(OrnamentType).map((ornamentType) => (
                <option key={ornamentType} value={ornamentType}>
                  {ornamentType.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="metalType"
              className="mb-2 block text-sm font-medium"
            >
              Metal Type
            </label>
            <select
              id="metalType"
              name="metalType"
              defaultValue={product.metalType}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-black"
            >
              {Object.values(MetalType).map((metalType) => (
                <option key={metalType} value={metalType}>
                  {metalType.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="defaultPurity"
              className="mb-2 block text-sm font-medium"
            >
              Default Purity
            </label>
            <select
              id="defaultPurity"
              name="defaultPurity"
              defaultValue={product.defaultPurity ?? ""}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-black"
            >
              <option value="">Select purity</option>
              {Object.values(PurityType).map((purity) => (
                <option key={purity} value={purity}>
                  {purity.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="designCode"
              className="mb-2 block text-sm font-medium"
            >
              Design Code
            </label>
            <input
              id="designCode"
              name="designCode"
              defaultValue={product.designCode ?? ""}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-black"
              placeholder="RG-CLASSIC-01"
            />
          </div>

          <div>
            <label
              htmlFor="hsnCode"
              className="mb-2 block text-sm font-medium"
            >
              HSN Code
            </label>
            <input
              id="hsnCode"
              name="hsnCode"
              defaultValue={product.hsnCode ?? ""}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-black"
              placeholder="7113"
            />
          </div>

          <div>
            <label
              htmlFor="isActive"
              className="mb-2 block text-sm font-medium"
            >
              Status
            </label>
            <select
              id="isActive"
              name="isActive"
              defaultValue={product.isActive ? "true" : "false"}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-black"
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>

        <div className="mt-5">
          <label
            htmlFor="description"
            className="mb-2 block text-sm font-medium"
          >
            Description
          </label>
          <textarea
            id="description"
            name="description"
            defaultValue={product.description ?? ""}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-black"
            placeholder="Optional description for this product master"
          />
        </div>

        <div className="mt-5">
          <label htmlFor="notes" className="mb-2 block text-sm font-medium">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            defaultValue={product.notes ?? ""}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-black"
            placeholder="Internal notes"
          />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => router.push("/inventory/products")}
            className="inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Updating..." : "Update Product"}
          </button>
        </div>
      </div>
    </form>
  )
}