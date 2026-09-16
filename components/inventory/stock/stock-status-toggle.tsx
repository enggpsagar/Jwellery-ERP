"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { disableStock, enableStock } from "@/lib/actions/inventory/stock-actions"
import { IncludesStoneToggle } from "@/components/ui/includes-stone-toggle"
import { useToast } from "@/components/providers/toast-provider"

/** Same immediate, no-confirm switch as ProductStatusToggle/KarigarStatusCard — flips
 * Active/Inactive on click, re-enabling is just as immediate. */
export function StockStatusToggle({
  stockId,
  isActive,
}: {
  stockId: string
  isActive: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = React.useState(false)

  async function handleToggle(nextActive: boolean) {
    try {
      setLoading(true)
      const result = nextActive ? await enableStock(stockId) : await disableStock(stockId)

      if (result.success) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error(nextActive ? "Failed to mark stock item active" : "Failed to mark stock item inactive")
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
