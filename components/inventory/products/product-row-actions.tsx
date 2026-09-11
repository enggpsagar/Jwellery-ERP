"use client"

import Link from "next/link"
import { Eye, Pencil } from "lucide-react"

import { DeleteProductButton } from "@/components/inventory/products/delete-product-button"
import { Button } from "@/components/ui/button"

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
      <Button variant="info" size="icon" asChild title="View product">
        <Link href={`/inventory/products/${productId}`}>
          <Eye className="h-4 w-4" />
        </Link>
      </Button>

      {canEdit && (
        <>
          <Button variant="edit" size="icon" asChild title="Edit product">
            <Link href={`/inventory/products/${productId}/edit`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>

          <DeleteProductButton productId={productId} productName={productName} />
        </>
      )}
    </div>
  )
}
