"use client"

import { useEffect, useState } from "react"

import type { CreditNoteView } from "@/lib/actions/credit-note-actions"
import { CreditNoteTable } from "@/components/billing/credit-note-table"
import { CreditNoteDetailPanel } from "@/components/billing/credit-note-detail-panel"
import { CreditNotesToolbar } from "@/components/billing/credit-notes-toolbar"
import { RecordDetailDialog, useRecordDialog } from "@/components/shared/record-detail-dialog"

type CreditNotesClientProps = {
  creditNotes: CreditNoteView[]
}

/**
 * Master-detail layout for Credit Notes — list on the left, full detail
 * (info, line items, total refunded) on the right, same treatment already
 * given to Customers/Vendors/Purchases/Billing/Quotations.
 */
export function CreditNotesClient({ creditNotes }: CreditNotesClientProps) {
  // Defaults to the first row on load so the panel is never empty —
  // matching every other master-detail list in the app.
  const [activeCreditNoteId, setActiveCreditNoteId] = useState<string | null>(
    creditNotes[0]?.id ?? null,
  )

  // The record in the full pop-up (first-column click); null = closed.
  const recordDialog = useRecordDialog(creditNotes)

  useEffect(() => {
    setActiveCreditNoteId((current) => {
      if (current && creditNotes.some((creditNote) => creditNote.id === current)) return current
      return creditNotes[0]?.id ?? null
    })
  }, [creditNotes])

  return (
    <div className="space-y-4">
      <CreditNotesToolbar />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-start">
        <CreditNoteTable
          creditNotes={creditNotes}
          activeCreditNoteId={activeCreditNoteId}
          onActivate={setActiveCreditNoteId}
          onOpen={recordDialog.open}
        />

        <CreditNoteDetailPanel creditNoteId={activeCreditNoteId} />

        <RecordDetailDialog
          {...recordDialog.dialogProps}
          title="Credit note details"
          fullPageHref={recordDialog.openId ? `/billing/credit-notes/${recordDialog.openId}` : undefined}
        >
          <CreditNoteDetailPanel creditNoteId={recordDialog.openId} />
        </RecordDetailDialog>
      </div>
    </div>
  )
}
