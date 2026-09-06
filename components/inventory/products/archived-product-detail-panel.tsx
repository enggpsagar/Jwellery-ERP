"use client"

import { useEffect, useState } from "react"
import { Package } from "lucide-react"

import { getProductById } from "@/lib/actions/inventory/product-actions"
import { ProductDetailContent } from "@/components/inventory/products/product-detail-content"
import { Skeleton } from "@/components/ui/skeleton"

type Product = NonNullable<Awaited<ReturnType<typeof getProductById>>>

type ArchivedProductDetailPanelProps = {
  productId: string | null
  /** PRODUCT_UPDATE — without it the Status field falls back to a
   * read-only badge (see ProductDetailContent), same gate the active
   * Products page's own panel uses. */
  canEdit?: boolean
}

/**
 * The right-hand pane of the Archived Products master-detail layout — same
 * ProductDetailContent (including the Status field's own Active/Inactive
 * switch) the active Products page's own panel shows, just without the
 * header's Edit/Delete actions — neither applies to a product that isn't
 * currently active. Re-activating happens via the Status field's own
 * toggle (already rendered inside ProductDetailContent when canEdit),
 * not a second "Restore" control here.
 */
export function ArchivedProductDetailPanel({ productId, canEdit = false }: ArchivedProductDetailPanelProps) {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!productId) {
      setProduct(null)
      return
    }

    let cancelled = false
    setLoading(true)
    getProductById(productId)
      .then((result) => {
        if (!cancelled) setProduct(result)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [productId])

  if (!productId) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <Package className="h-8 w-8" />
        <p className="text-sm">Select a product to view its details.</p>
      </div>
    )
  }

  if (loading || !product) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6">
      <h2 className="text-lg font-semibold">{product.name}</h2>

      <ProductDetailContent product={product} canEdit={canEdit} />
    </div>
  )
}
