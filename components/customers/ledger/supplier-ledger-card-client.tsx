"use client"

import { useEffect, useState } from "react"

import {
  getSupplierLedgerEntries,
  type SupplierLedgerEntryItem,
} from "@/lib/actions/customer-ledger-actions"
import { SupplierLedgerBody } from "@/components/customers/ledger/supplier-ledger-body"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Client-fetched twin of SupplierLedgerCard — same table, fetched via
 * useEffect since this renders inside the client-side master-detail panel.
 */
export function SupplierLedgerCardClient({ customerId }: { customerId: string }) {
  const [entries, setEntries] = useState<SupplierLedgerEntryItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setEntries(null)
    getSupplierLedgerEntries(customerId).then((data) => {
      if (!cancelled) setEntries(data)
    })
    return () => {
      cancelled = true
    }
  }, [customerId])

  if (!entries) {
    return <Skeleton className="h-40 w-full" />
  }

  return <SupplierLedgerBody customerId={customerId} entries={entries} />
}
