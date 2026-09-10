"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { archiveStore, restoreStore } from "@/lib/actions/store-actions"
import { IncludesStoneToggle } from "@/components/ui/includes-stone-toggle"
import { useToast } from "@/components/providers/toast-provider"

/** Same immediate, no-confirm switch as KarigarStatusCard/ProductStatusToggle —
 * flips Active/Inactive on click. Archiving still blocks sign-in for this
 * store's own Admin/Staff/Karigar users going forward, same as before;
 * re-enabling is just as immediate. */
export function StoreStatusToggle({
  storeId,
  isActive,
  onSuccess,
}: {
  storeId: string
  isActive: boolean
  /** Called after a successful toggle, in addition to router.refresh() —
   * needed by callers (e.g. StoreDetailPanel) whose own "isActive" comes
   * from client-fetched state that router.refresh() can't reach. */
  onSuccess?: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = React.useState(false)

  async function handleToggle(nextActive: boolean) {
    try {
      setLoading(true)
      const result = nextActive
        ? await restoreStore(storeId)
        : await archiveStore(storeId)

      if (result.success) {
        toast.success(result.message)
        router.refresh()
        onSuccess?.()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error(nextActive ? "Failed to restore store" : "Failed to archive store")
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
