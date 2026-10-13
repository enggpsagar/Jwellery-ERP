// components/customers/ledger/customer-ledger-card.tsx
import { getPartyLedger } from "@/lib/actions/customer-ledger-actions"
import { CustomerLedgerBody } from "@/components/customers/ledger/customer-ledger-body"

type CustomerLedgerCardProps = {
  customerId: string
  hasEmail: boolean
}

/** Server-fetched — used by the standalone /customers/[id] page. */
export async function CustomerLedgerCard({ customerId, hasEmail }: CustomerLedgerCardProps) {
  const ledger = await getPartyLedger(customerId)
  return <CustomerLedgerBody customerId={customerId} hasEmail={hasEmail} ledger={ledger} />
}
