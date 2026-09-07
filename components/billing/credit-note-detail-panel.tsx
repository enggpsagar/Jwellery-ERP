"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Printer, Receipt } from "lucide-react"

import { getCreditNoteById, type CreditNoteView } from "@/lib/actions/credit-note-actions"
import { CreditNoteDetailContent } from "@/components/billing/credit-note-detail-content"
import { Skeleton } from "@/components/ui/skeleton"

type CreditNoteDetailPanelProps = {
  creditNoteId: string | null
}

/**
 * The right-hand pane of the Credit Notes master-detail layout — fetches
 * and shows exactly what the standalone /billing/credit-notes/[id] page
 * shows (same CreditNoteDetailContent), just inline next to the list
 * instead of a full navigation. Same convention as QuotationDetailPanel/
 * InvoiceDetailPanel.
 */
export function CreditNoteDetailPanel({ creditNoteId }: CreditNoteDetailPanelProps) {
  const [creditNote, setCreditNote] = useState<CreditNoteView | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!creditNoteId) {
      setCreditNote(null)
      return
    }

    let cancelled = false
    setLoading(true)
    getCreditNoteById(creditNoteId)
      .then((result) => {
        if (!cancelled) setCreditNote(result)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [creditNoteId])

  if (!creditNoteId) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <Receipt className="h-8 w-8" />
        <p className="text-sm">Select a credit note to view its details.</p>
      </div>
    )
  }

  if (loading || !creditNote) {
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
        <h2 className="text-lg font-semibold">{creditNote.creditNoteNumber}</h2>
        <Link
          href={`/billing/credit-notes/${creditNote.id}/print`}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          <Printer className="h-4 w-4" />
          Print
        </Link>
      </div>

      <CreditNoteDetailContent creditNote={creditNote} />
    </div>
  )
}
