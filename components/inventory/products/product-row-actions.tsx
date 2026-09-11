"use client"

import Link from "next/link"
import { Eye, Pencil } from "lucide-react"

import { DeleteProductButton } from "@/components/inventory/products/delete-product-button"

type ProductRowActionsProps = {
  productId: string
  productName: string
  /** PRODUCT_UPDATE. Edit and delete are hidden without it; View stays, so a
   * view-only user still reaches the full read-only detail page. */
  canEdit?: boolean
}

export function ProductRowActions({
  productId,
  productName,
  canEdit = false,
}: ProductRowActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/inventory/products/${productId}`}
        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-sm text-primary hover:bg-primary/20"
        title="View product"
      >
        <Eye className="h-4 w-4" />
      </Link>

      {canEdit && (
        <>
          <Link
            href={`/inventory/products/${productId}/edit`}
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-sm text-primary hover:bg-primary/20"
            title="Edit product"
          >
            <Pencil className="h-4 w-4" />
          </Link>

          <DeleteProductButton productId={productId} productName={productName} />
        </>
      )}
    </div>
  )
}
