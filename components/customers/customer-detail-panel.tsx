"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { Users } from "lucide-react"

import { getCustomerById, type Customer } from "@/lib/actions/customer-actions"
import { toTitleCase } from "@/lib/utils"
import { CustomerRowActions } from "@/components/customers/customer-row-actions"
import { CustomerDetailContent } from "@/components/customers/customer-detail-content"
import { CustomerLedgerCardClient } from "@/components/customers/ledger/customer-ledger-card-client"
import { Skeleton } from "@/components/ui/skeleton"

type StateItem = {
  id: string
  name: string
}

type CustomerDetailPanelProps = {
  customerId: string | null
  states: StateItem[]
  /** Drop the card border/padding — for a host that is already a card (the
   *  party pop-up). */
  bare?: boolean
  /** Open the ledger history table straight away (the pop-up, where the
   *  full ledger is the point). */
  defaultShowLedgerDetails?: boolean
  /** Extra controls beside the Edit/Archive/Delete actions in the header. */
  headerActions?: React.ReactNode
}

/**
 * The right-hand pane of the Customers master-detail layout — fetches and
 * shows exactly what the standalone /customers/[id] page shows (same
 * CustomerDetailContent), just inline next to the list instead of a full
 * navigation. Re-fetches whenever the selected id changes; a delete/
 * archive from CustomerRowActions here calls router.refresh() same as the
 * standalone page, which re-renders the list — the selection itself is
 * cleared by the parent's own effect watching the customers prop.
 */
export function CustomerDetailPanel({
  customerId,
  states,
  bare = false,
  defaultShowLedgerDetails,
  headerActions,
}: CustomerDetailPanelProps) {
  const shell = bare ? "space-y-4" : "space-y-4 rounded-xl border bg-card p-6"

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!customerId) {
      setCustomer(null)
      return
    }

    let cancelled = false
    setLoading(true)
    getCustomerById(customerId)
      .then((result) => {
        if (!cancelled) setCustomer(result)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [customerId])

  if (!customerId) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <Users className="h-8 w-8" />
        <p className="text-sm">Select a party to view their details.</p>
      </div>
    )
  }

  if (loading || !customer) {
    return (
      <div className={shell}>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className={shell}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{toTitleCase(customer.name)}</h2>
        <div className="flex items-center gap-2">
          {headerActions}
          <CustomerRowActions customer={customer} states={states} />
        </div>
      </div>

      <CustomerDetailContent
        customer={customer}
        states={states}
        ledger={
          <CustomerLedgerCardClient
            customerId={customer.id}
            hasEmail={Boolean(customer.email)}
            defaultShowDetails={defaultShowLedgerDetails}
          />
        }
      />
    </div>
  )
}
