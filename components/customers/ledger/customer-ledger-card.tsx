// components/customers/ledger/customer-ledger-card.tsx
import {
  getCustomerLedgerEntries,
  getCustomerLedgerSummary,
} from "@/lib/actions/customer-ledger-actions"
import { getActiveBusinessUnits } from "@/lib/business-units.server"
import { CustomerLedgerBody } from "@/components/customers/ledger/customer-ledger-body"

type CustomerLedgerCardProps = {
  customerId: string
}

/** Server-fetched — used by the standalone /customers/[id] page. */
export async function CustomerLedgerCard({ customerId }: CustomerLedgerCardProps) {
  const [entries, summary, activeUnits] = await Promise.all([
    getCustomerLedgerEntries(customerId),
    getCustomerLedgerSummary(customerId),
    getActiveBusinessUnits(),
  ])

  return (
    <CustomerLedgerBody
      customerId={customerId}
      entries={entries}
      summary={summary}
      activeUnits={activeUnits}
    />
  )
}
