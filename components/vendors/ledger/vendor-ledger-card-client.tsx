"use client"

import { useEffect, useState } from "react"

import { getVendorLedger, type VendorLedgerEntryItem } from "@/lib/actions/vendor-actions"
import { VendorLedgerBody } from "@/components/vendors/ledger/vendor-ledger-body"
import { Skeleton } from "@/components/ui/skeleton"

type VendorLedgerCardClientProps = {
  vendorId: string
}

/**
 * Client-fetched twin of VendorLedgerCard — same VendorLedgerBody, but
 * fetched via useEffect (calling the same "use server" getVendorLedger
 * directly) since this renders inside the client-side master-detail panel,
 * where a server component can't be reached by import.
 */
export function VendorLedgerCardClient({ vendorId }: VendorLedgerCardClientProps) {
  const [entries, setEntries] = useState<VendorLedgerEntryItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setEntries(null)
    getVendorLedger(vendorId).then((result) => {
      if (!cancelled) setEntries(result)
    })
    return () => {
      cancelled = true
    }
  }, [vendorId])

  if (!entries) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return <VendorLedgerBody entries={entries} />
}
