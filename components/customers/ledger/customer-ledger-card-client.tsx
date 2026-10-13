"use client"

import { useEffect, useState } from "react"

import { getPartyLedger, type PartyLedger } from "@/lib/actions/customer-ledger-actions"
import { CustomerLedgerBody } from "@/components/customers/ledger/customer-ledger-body"
import { Skeleton } from "@/components/ui/skeleton"

type CustomerLedgerCardClientProps = {
  customerId: string
  hasEmail: boolean
  /** Open the history table straight away. */
  defaultShowDetails?: boolean
}

/**
 * Client-fetched twin of CustomerLedgerCard — same CustomerLedgerBody, but
 * fetched via useEffect (calling the same "use server" action directly)
 * since this renders inside client-side master-detail panels, where a
 * server component can't be reached by import.
 */
export function CustomerLedgerCardClient({
  customerId,
  hasEmail,
  defaultShowDetails,
}: CustomerLedgerCardClientProps) {
  const [ledger, setLedger] = useState<{ id: string; data: PartyLedger | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLedger(null)
    getPartyLedger(customerId).then((data) => {
      if (!cancelled) setLedger({ id: customerId, data })
    })
    return () => {
      cancelled = true
    }
  }, [customerId])

  if (!ledger || ledger.id !== customerId) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <CustomerLedgerBody
      key={customerId}
      customerId={customerId}
      hasEmail={hasEmail}
      ledger={ledger.data}
      defaultShowDetails={defaultShowDetails}
    />
  )
}
