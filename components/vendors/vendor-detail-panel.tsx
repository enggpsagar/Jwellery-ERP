"use client"

import { useEffect, useState } from "react"
import { Truck } from "lucide-react"

import { getVendorById, type Vendor } from "@/lib/actions/vendor-actions"
import { toTitleCase } from "@/lib/utils"
import { VendorRowActions } from "@/components/vendors/vendor-row-actions"
import { VendorDetailContent } from "@/components/vendors/vendor-detail-content"
import { VendorLedgerCardClient } from "@/components/vendors/ledger/vendor-ledger-card-client"
import { Skeleton } from "@/components/ui/skeleton"

type StateItem = {
  id: string
  name: string
}

type VendorDetailPanelProps = {
  vendorId: string | null
  states: StateItem[]
}

/**
 * The right-hand pane of the Vendors master-detail layout — fetches and
 * shows exactly what the standalone /vendors/[id] page shows (same
 * VendorDetailContent), just inline next to the list instead of a full
 * navigation.
 */
export function VendorDetailPanel({ vendorId, states }: VendorDetailPanelProps) {
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!vendorId) {
      setVendor(null)
      return
    }

    let cancelled = false
    setLoading(true)
    getVendorById(vendorId)
      .then((result) => {
        if (!cancelled) setVendor(result)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [vendorId])

  if (!vendorId) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <Truck className="h-8 w-8" />
        <p className="text-sm">Select a vendor to view their details.</p>
      </div>
    )
  }

  if (loading || !vendor) {
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
        <div>
          <h2 className="text-lg font-semibold">{toTitleCase(vendor.name)}</h2>
          <p className="text-sm text-muted-foreground">
            {vendor.vendorType || "Vendor"}
          </p>
        </div>
        <VendorRowActions vendor={vendor} states={states} />
      </div>

      <VendorDetailContent vendor={vendor} ledger={<VendorLedgerCardClient vendorId={vendor.id} />} />
    </div>
  )
}
