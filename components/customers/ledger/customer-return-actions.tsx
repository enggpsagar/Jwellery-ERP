"use client"

import { useEffect, useState } from "react"

import { getCustomerReturnableInvoices } from "@/lib/actions/invoice-actions"
import { CustomerReturnLauncher } from "@/components/customers/ledger/customer-return-launcher"

/**
 * Refund/Replace only make sense once there's at least one past sale to
 * act against — hidden entirely otherwise, rather than showing buttons
 * that would just open an empty picker every time.
 */
export function CustomerReturnActions({ customerId }: { customerId: string }) {
  const [hasAnyInvoice, setHasAnyInvoice] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    getCustomerReturnableInvoices(customerId).then((result) => {
      if (!cancelled) setHasAnyInvoice(result.hasAnyInvoice)
    })
    return () => {
      cancelled = true
    }
  }, [customerId])

  if (!hasAnyInvoice) return null

  return (
    <>
      <CustomerReturnLauncher customerId={customerId} action="refund" />
      <CustomerReturnLauncher customerId={customerId} action="replace" />
    </>
  )
}
