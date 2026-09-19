"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Package, PackagePlus } from "lucide-react"

import { getProductById } from "@/lib/actions/inventory/product-actions"
import { ProductRowActions } from "@/components/inventory/products/product-row-actions"
import { ProductDetailContent } from "@/components/inventory/products/product-detail-content"
import { ProductStatusToggle } from "@/components/inventory/products/product-status-toggle"
import { ActiveBadge } from "@/components/shared/active-badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

type Product = NonNullable<Awaited<ReturnType<typeof getProductById>>>

type ProductDetailPanelProps = {
  productId: string | null
  /** PRODUCT_UPDATE — hides Edit/Delete in the panel header for view-only users. */
  canEdit?: boolean
  /** Bumped by the parent after a list-level bulk action (Archive/Delete
   * Selected) that may have changed the currently-viewed product without
   * changing which id is selected — this panel fetches its own data
   * client-side keyed on productId, so a plain router.refresh() from
   * elsewhere never reaches it on its own. Any changing value forces the
   * re-fetch below. */
  refreshToken?: number
}

/**
 * The right-hand pane of the Products master-detail layout — fetches and
 * shows exactly what the standalone /inventory/products/[id] page shows
 * (same ProductDetailContent), just inline next to the list instead of a
 * full navigation. Re-fetches whenever the selected id changes, refreshToken
 * bumps (see its own doc comment), or this panel's own Status toggle
 * succeeds (see the onSuccess passed to ProductStatusToggle below) — a
 * delete from ProductRowActions here calls router.refresh() same as the
 * standalone page, which re-renders the list — the selection itself is
 * cleared by the parent's own effect watching the products prop.
 */
export function ProductDetailPanel({ productId, canEdit = false, refreshToken }: ProductDetailPanelProps) {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchProduct = useCallback((id: string) => {
    let cancelled = false
    setLoading(true)
    getProductById(id)
      .then((result) => {
        if (!cancelled) setProduct(result)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!productId) {
      setProduct(null)
      return
    }
    return fetchProduct(productId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, refreshToken])

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
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            // Same blue (chart-1) as the top-bar "Purchase" button — both
            // are "bring more inventory in" actions, so they share a hue
            // distinct from the toggle/eye/edit/delete icons beside it.
            className="gap-1.5 bg-[var(--chart-1)] text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--chart-1)_88%,black)]"
            asChild
          >
            <Link href={`/inventory/stock/new?productId=${product.id}`}>
              <PackagePlus className="h-4 w-4" />
              Add Stock
            </Link>
          </Button>
          {canEdit ? (
            <ProductStatusToggle
              productId={product.id}
              isActive={product.isActive}
              onSuccess={() => fetchProduct(product.id)}
            />
          ) : (
            <ActiveBadge isActive={product.isActive} />
          )}
          <ProductRowActions
            productId={product.id}
            productName={product.name}
            canEdit={canEdit}
          />
        </div>
      </div>

      <ProductDetailContent product={product} canEdit={canEdit} hideStatusField />
    </div>
  )
}
