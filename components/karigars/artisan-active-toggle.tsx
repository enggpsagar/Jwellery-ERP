"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { disableKarigar, enableKarigar } from "@/lib/actions/karigar-actions"
import { IncludesStoneToggle } from "@/components/ui/includes-stone-toggle"
import { useToast } from "@/components/providers/toast-provider"

/** The bare Active/Inactive switch (same control as "Includes a Stone" on
 *  the invoice/purchase forms) — flips immediately on click, no confirm
 *  step, since re-enabling is just as immediate. Shared by KarigarStatusCard
 *  (the standalone /karigars/[id] page's own grid) and the Karigars list's
 *  split-panel header (next to Edit, see karigar-detail-panel.tsx) so the
 *  enable/disable logic can't drift between the two surfaces. */
export function ArtisanActiveToggle({
  karigarId,
  isActive,
  className,
}: {
  karigarId: string
  isActive: boolean
  className?: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = React.useState(false)

  async function handleToggle(nextActive: boolean) {
    try {
      setLoading(true)
      const result = nextActive ? await enableKarigar(karigarId) : await disableKarigar(karigarId)

      if (result.success) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error(nextActive ? "Failed to re-enable artisan" : "Failed to disable artisan")
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
      className={className}
    />
  )
}
