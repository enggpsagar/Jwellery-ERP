"use client"

import Link from "next/link"
import { Eye, Pencil } from "lucide-react"

import { DeleteProductButton } from "@/components/inventory/products/delete-product-button"

type ProductRow = {
  id: string
  productCode: string
  name: string
  category: string
  ornamentType: string | null
  metalType: string
  defaultPurity: string | null
  isActive: boolean
  createdAt: Date | string
}

type ProductsTableProps = {
  products: ProductRow[]
}

export function ProductsTable({ products }: ProductsTableProps) {
  if (!products.length) {
    return (
      <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
        No products found yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Product Code</th>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Category</th>
              <th className="px-4 py-3 text-left font-medium">Ornament Type</th>
              <th className="px-4 py-3 text-left font-medium">Metal</th>
              <th className="px-4 py-3 text-left font-medium">Purity</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b last:border-0">
                <td className="px-4 py-3">{product.productCode}</td>
                <td className="px-4 py-3 font-medium">{product.name}</td>
                <td className="px-4 py-3">{product.category}</td>
                <td className="px-4 py-3">{product.ornamentType ?? "-"}</td>
                <td className="px-4 py-3">{product.metalType}</td>
                <td className="px-4 py-3">{product.defaultPurity ?? "-"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      product.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {product.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/inventory/products/${product.id}`}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
                      title="View product"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>

                    <Link
                      href={`/inventory/products/${product.id}/edit`}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-amber-700 hover:bg-amber-50"
                      title="Edit product"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>

                    <DeleteProductButton
                      productId={product.id}
                      productName={product.name}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}