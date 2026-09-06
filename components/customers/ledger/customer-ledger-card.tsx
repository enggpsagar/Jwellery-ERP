// components/customers/ledger/customer-ledger-card.tsx
import {
  getCustomerLedgerEntries,
  getCustomerLedgerSummary,
} from "@/lib/actions/customer-ledger-actions"
import { CustomerLedgerBody } from "@/components/customers/ledger/customer-ledger-body"

type CustomerLedgerCardProps = {
  customerId: string
  hasEmail: boolean
}

/** Server-fetched — used by the standalone /customers/[id] page. */
export async function CustomerLedgerCard({ customerId, hasEmail }: CustomerLedgerCardProps) {
  const [entries, summary] = await Promise.all([
    getCustomerLedgerEntries(customerId),
    getCustomerLedgerSummary(customerId),
  ])

  return (
    <CustomerLedgerBody
      customerId={customerId}
      hasEmail={hasEmail}
      entries={entries}
      summary={summary}
    />
  )
}
