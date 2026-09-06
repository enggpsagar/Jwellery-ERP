"use client"

import { useEffect, useState } from "react"
import { Users } from "lucide-react"

import { getCustomerById, type Customer } from "@/lib/actions/customer-actions"
import { toTitleCase } from "@/lib/utils"
import { ArchivedCustomerRestoreButton } from "@/components/customers/archived-customer-restore-button"
import { CustomerDetailContent } from "@/components/customers/customer-detail-content"
import { CustomerLedgerCardClient } from "@/components/customers/ledger/customer-ledger-card-client"
import { Skeleton } from "@/components/ui/skeleton"

type StateItem = {
  id: string
  name: string
}

type ArchivedCustomerDetailPanelProps = {
  customerId: string | null
  states: StateItem[]
}

/**
 * The right-hand pane of the Archived Customers master-detail layout —
 * same CustomerDetailContent/ledger the active Customers page's own panel
 * shows, just with Restore in place of Edit/Archive/Delete in the header
 * (those don't apply to an already-archived record).
 */
export function ArchivedCustomerDetailPanel({ customerId, states }: ArchivedCustomerDetailPanelProps) {
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
        <p className="text-sm">Select a customer to view their details.</p>
      </div>
    )
  }

  if (loading || !customer) {
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
        <h2 className="text-lg font-semibold">{toTitleCase(customer.name)}</h2>
        <ArchivedCustomerRestoreButton
          customerId={customer.id}
          customerName={toTitleCase(customer.name)}
        />
      </div>

      <CustomerDetailContent
        customer={customer}
        states={states}
        ledger={
          <CustomerLedgerCardClient
            customerId={customer.id}
            hasEmail={Boolean(customer.email)}
          />
        }
      />
    </div>
  )
}
