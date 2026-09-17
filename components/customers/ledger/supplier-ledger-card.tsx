// components/customers/ledger/supplier-ledger-card.tsx
import { getSupplierLedgerEntries } from "@/lib/actions/customer-ledger-actions"
import { SupplierLedgerHistoryTable } from "@/components/customers/ledger/supplier-ledger-history-table"

/** Server-fetched — used by the standalone /customers/[id] page. */
export async function SupplierLedgerCard({ customerId }: { customerId: string }) {
  const entries = await getSupplierLedgerEntries(customerId)
  return <SupplierLedgerHistoryTable entries={entries} />
}
