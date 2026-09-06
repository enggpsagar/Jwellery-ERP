"use client"

import { useEffect, useState } from "react"

import {
  getCustomerLedgerEntries,
  getCustomerLedgerSummary,
  type CustomerLedgerEntryItem,
  type CustomerLedgerSummary,
} from "@/lib/actions/customer-ledger-actions"
import { CustomerLedgerBody } from "@/components/customers/ledger/customer-ledger-body"
import { Skeleton } from "@/components/ui/skeleton"

type CustomerLedgerCardClientProps = {
  customerId: string
  hasEmail: boolean
}

type LedgerData = {
  entries: CustomerLedgerEntryItem[]
  summary: CustomerLedgerSummary | null
}

/**
 * Client-fetched twin of CustomerLedgerCard — same CustomerLedgerBody, but
 * fetched via useEffect (calling the same "use server" actions directly)
 * since this renders inside the client-side master-detail panel, where a
 * server component can't be reached by import.
 */
export function CustomerLedgerCardClient({ customerId, hasEmail }: CustomerLedgerCardClientProps) {
  const [data, setData] = useState<LedgerData | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    Promise.all([
      getCustomerLedgerEntries(customerId),
      getCustomerLedgerSummary(customerId),
    ]).then(([entries, summary]) => {
      if (!cancelled) setData({ entries, summary })
    })
    return () => {
      cancelled = true
    }
  }, [customerId])

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <CustomerLedgerBody
      customerId={customerId}
      hasEmail={hasEmail}
      entries={data.entries}
      summary={data.summary}
    />
  )
}
