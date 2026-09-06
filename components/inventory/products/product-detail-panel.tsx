"use client"

import { useEffect, useState } from "react"
import { Package } from "lucide-react"

import { getProductById } from "@/lib/actions/inventory/product-actions"
import { ProductRowActions } from "@/components/inventory/products/product-row-actions"
import { ProductDetailContent } from "@/components/inventory/products/product-detail-content"
import { Skeleton } from "@/components/ui/skeleton"

type Product = NonNullable<Awaited<ReturnType<typeof getProductById>>>

type ProductDetailPanelProps = {
  productId: string | null
  /** PRODUCT_UPDATE — hides Edit/Delete in the panel header for view-only users. */
  canEdit?: boolean
}

/**
 * The right-hand pane of the Products master-detail layout — fetches and
 * shows exactly what the standalone /inventory/products/[id] page shows
 * (same ProductDetailContent), just inline next to the list instead of a
 * full navigation. Re-fetches whenever the selected id changes; a delete
 * from ProductRowActions here calls router.refresh() same as the standalone
 * page, which re-renders the list — the selection itself is cleared by the
 * parent's own effect watching the products prop.
 */
export function ProductDetailPanel({ productId, canEdit = false }: ProductDetailPanelProps) {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{product.name}</h2>
        <ProductRowActions
          productId={product.id}
          productName={product.name}
          canEdit={canEdit}
        />
      </div>

      <ProductDetailContent product={product} />
    </div>
  )
}
