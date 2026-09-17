"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { toggleCustomerSupplierStatus } from "@/lib/actions/customer-actions"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/providers/toast-provider"

/**
 * The explicit "Also Supplier" action on a Party's detail page — only ever
 * rendered while BusinessSettings.supplierModuleEnabled is on (the caller
 * decides that, this component doesn't check it itself). Reversible and
 * low-risk (just a flag flip on the same row, not a delete/archive), so no
 * confirm dialog — same instant-toggle treatment as any other Settings
 * Switch in this app.
 */
export function SupplierStatusToggle({
  customerId,
  isSupplier,
}: {
  customerId: string
  isSupplier: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = React.useState(false)

  async function handleChange(next: boolean) {
    try {
      setPending(true)
      const result = await toggleCustomerSupplierStatus(customerId, next)
      if (result.success) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error("Failed to update supplier status")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Switch checked={isSupplier} disabled={pending} onCheckedChange={handleChange} />
      <span className="text-sm">{isSupplier ? "Supplier" : "Not a supplier"}</span>
    </div>
  )
}
