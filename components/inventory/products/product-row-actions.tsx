"use client"

import Link from "next/link"
import { Eye, Pencil } from "lucide-react"

import { DeleteProductButton } from "@/components/inventory/products/delete-product-button"

type ProductRowActionsProps = {
  productId: string
  productName: string
}

export function ProductRowActions({
  productId,
  productName,
}: ProductRowActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/inventory/products/${productId}`}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
        title="View product"
      >
        <Eye className="h-4 w-4" />
      </Link>

      <Link
        href={`/inventory/products/${productId}/edit`}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
        title="Edit product"
      >
        <Pencil className="h-4 w-4" />
      </Link>

      <DeleteProductButton productId={productId} productName={productName} />
    </div>
  )
}
