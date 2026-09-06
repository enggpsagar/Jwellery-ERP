"use client"

import { useEffect, useState } from "react"
import { Users } from "lucide-react"

import { getCustomerById, type Customer } from "@/lib/actions/customer-actions"
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
export function CustomerDetailPanel({ customerId, states }: CustomerDetailPanelProps) {
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
        <div>
          <h2 className="text-lg font-semibold">{customer.name}</h2>
          <p className="text-sm text-muted-foreground">
            {customer.customerType || "Customer"}
          </p>
        </div>
        <CustomerRowActions customer={customer} states={states} />
      </div>

      <CustomerDetailContent
        customer={customer}
        states={states}
        ledger={<CustomerLedgerCardClient customerId={customer.id} />}
      />
    </div>
  )
}
