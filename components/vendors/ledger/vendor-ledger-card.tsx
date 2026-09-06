// components/vendors/ledger/vendor-ledger-card.tsx
import { getVendorLedger } from "@/lib/actions/vendor-actions"
import { VendorLedgerBody } from "@/components/vendors/ledger/vendor-ledger-body"

type VendorLedgerCardProps = {
  vendorId: string
}

/** Server-fetched — used by the standalone /vendors/[id] page. */
export async function VendorLedgerCard({ vendorId }: VendorLedgerCardProps) {
  const entries = await getVendorLedger(vendorId)
  return <VendorLedgerBody entries={entries} />
}
