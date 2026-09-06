// components/vendors/ledger/vendor-ledger-body.tsx
import type { VendorLedgerEntryItem } from "@/lib/actions/vendor-actions"
import { VendorLedgerHistoryTable } from "@/components/vendors/ledger/vendor-ledger-history-table"

/**
 * The vendor ledger's presentation — no data fetching of its own, so it has
 * no server-only imports and can be rendered from either the server-fetched
 * VendorLedgerCard or the client-fetched VendorLedgerCardClient.
 *
 * Renders nothing at all when there are no entries — a "Vendor Ledger"
 * header restating what the table below it already says, sitting above an
 * empty table, isn't information either.
 */
export function VendorLedgerBody({ entries }: { entries: VendorLedgerEntryItem[] }) {
  if (entries.length === 0) return null

  return (
    <section className="space-y-4">
      <VendorLedgerHistoryTable entries={entries} />
    </section>
  )
}
