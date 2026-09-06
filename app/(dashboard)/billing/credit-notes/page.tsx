import type { Metadata } from "next"

import { getCreditNotes } from "@/lib/actions/credit-note-actions"
import { CreditNoteTable } from "@/components/billing/credit-note-table"
import { PageBackHeader } from "@/components/shared/page-back-header"

export const metadata: Metadata = {
  title: "Credit Notes",
}

export const dynamic = "force-dynamic"

/**
 * No server pagination here (unlike /billing) — a store's returns are a
 * small fraction of its invoice volume, so a single page is expected to
 * stay comfortably sized. Revisit with the same page/pageSize pattern as
 * getInvoices if that assumption stops holding.
 */
export default async function CreditNotesPage() {
  const creditNotes = await getCreditNotes()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Credit Notes"
        description="Returns processed against paid invoices."
        backHref="/billing"
        backLabel="Back to Billing"
      />

      <CreditNoteTable creditNotes={creditNotes} />
    </main>
  )
}
