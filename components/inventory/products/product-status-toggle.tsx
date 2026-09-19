"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { disableProduct, enableProduct } from "@/lib/actions/inventory/product-actions"
import { IncludesStoneToggle } from "@/components/ui/includes-stone-toggle"
import { useToast } from "@/components/providers/toast-provider"

/** Same immediate, no-confirm switch as KarigarStatusCard — flips
 * Active/Inactive on click, re-enabling is just as immediate. */
export function ProductStatusToggle({
  productId,
  isActive,
  onSuccess,
}: {
  productId: string
  isActive: boolean
  /** Called after a successful toggle, in addition to router.refresh() —
   * the caller's own `product` state (ProductDetailPanel) is fetched
   * client-side via an effect keyed only on productId, so it never
   * re-fetches on its own just because the router refreshed. */
  onSuccess?: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = React.useState(false)

  async function handleToggle(nextActive: boolean) {
    try {
      setLoading(true)
      const result = nextActive
        ? await enableProduct(productId)
        : await disableProduct(productId)

      if (result.success) {
        toast.success(result.message)
        router.refresh()
        onSuccess?.()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error(nextActive ? "Failed to mark product active" : "Failed to mark product inactive")
    } finally {
      setLoading(false)
    }
  }

  return (
    <IncludesStoneToggle
      checked={isActive}
      onChange={handleToggle}
      label={isActive ? "Active" : "Inactive"}
      disabled={loading}
    />
  )
}
