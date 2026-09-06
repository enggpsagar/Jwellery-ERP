"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { disableKarigar, enableKarigar } from "@/lib/actions/karigar-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { IncludesStoneToggle } from "@/components/ui/includes-stone-toggle"
import { useToast } from "@/components/providers/toast-provider"

/** The Status card on an artisan's detail page — a single switch-style
 *  toggle (same control as "Includes a Stone" on the invoice/purchase
 *  forms) that flips Active/Inactive immediately on click, no confirm
 *  step — re-enabling is just as immediate, so a misclick costs one more
 *  click to undo rather than a dialog to get through. */
export function KarigarStatusCard({
  karigarId,
  isActive,
}: {
  karigarId: string
  isActive: boolean
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
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">Status</CardTitle>
      </CardHeader>
      <CardContent>
        <IncludesStoneToggle
          checked={isActive}
          onChange={handleToggle}
          label={isActive ? "Active" : "Inactive"}
          disabled={loading}
        />
      </CardContent>
    </Card>
  )
}
