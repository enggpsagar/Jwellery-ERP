import type { LedgerEntryFilters, LedgerEntryRow } from "@/lib/actions/ledger-actions"

/**
 * The Ledger page's filter rules — one copy shared by LedgerView (client)
 * and the export (getLedgerEntriesForExport), so an export with the page's
 * filters returns exactly the rows the page lists (without its 500 cap).
 * Dates compare as YYYY-MM-DD strings, inclusive at both ends.
 */
export function ledgerEntryMatches(entry: LedgerEntryRow, filters: LedgerEntryFilters) {
  if (filters.account && entry.account !== filters.account) return false
  if (filters.type && entry.sourceLabel !== filters.type) return false
  if (filters.dateFrom && entry.dateISO < filters.dateFrom) return false
  if (filters.dateTo && entry.dateISO > filters.dateTo) return false
  if (filters.search) {
    const q = filters.search.toLowerCase()
    const haystack = `${entry.account} ${entry.id} ${entry.invoiceNumber ?? ""} ${entry.description}`.toLowerCase()
    if (!haystack.includes(q)) return false
  }
  return true
}

/** The export link for the page's current filters. */
export function ledgerExportHref(filters: LedgerEntryFilters) {
  const params = new URLSearchParams({ scope: "entries" })
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value)
  }
  return `/ledger/export?${params.toString()}`
}
