"use client"

import { useEffect, useState } from "react"
import { Receipt } from "lucide-react"

import { getInvoiceById, type Invoice } from "@/lib/actions/invoice-actions"
import { getCreditNotesForInvoice, type CreditNoteView } from "@/lib/actions/credit-note-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { InvoiceActionsBar } from "@/components/billing/invoice-actions-bar"
import { InvoiceDetailContent } from "@/components/billing/invoice-detail-content"
import { Skeleton } from "@/components/ui/skeleton"
import type { LocationOption } from "@/components/shared/location-select"

type InvoiceDetailPanelProps = {
  invoiceId: string | null
  locations: LocationOption[]
}

/**
 * The right-hand pane of the Billing master-detail layout — fetches and
 * shows exactly what the standalone /billing/[id] page shows (same
 * InvoiceActionsBar/InvoiceDetailContent), just inline next to the list
 * instead of a full navigation. Re-fetches whenever the selected id
 * changes — same convention as PurchaseDetailPanel/CustomerDetailPanel.
 * Business settings (return window, business name) and credit notes are
 * fetched alongside the invoice itself, same three data sources the
 * standalone page also needs.
 */
export function InvoiceDetailPanel({ invoiceId, locations }: InvoiceDetailPanelProps) {
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [creditNotes, setCreditNotes] = useState<CreditNoteView[]>([])
  const [businessName, setBusinessName] = useState("")
  const [returnWindowDays, setReturnWindowDays] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!invoiceId) {
      setInvoice(null)
      return
    }

    let cancelled = false
    setLoading(true)
    Promise.all([
      getInvoiceById(invoiceId),
      getCreditNotesForInvoice(invoiceId),
      getBusinessSettings(),
    ])
      .then(([invoiceResult, creditNotesResult, settings]) => {
        if (cancelled) return
        setInvoice(invoiceResult)
        setCreditNotes(creditNotesResult)
        setBusinessName(settings.businessName)
        setReturnWindowDays(settings.returnWindowDays)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [invoiceId])

  if (!invoiceId) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <Receipt className="h-8 w-8" />
        <p className="text-sm">Select an invoice to view its details.</p>
      </div>
    )
  }

  if (loading || !invoice) {
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
        <h2 className="text-lg font-semibold">{invoice.invoiceNumber}</h2>
      </div>

      <InvoiceActionsBar
        invoice={invoice}
        locations={locations}
        businessName={businessName}
        returnWindowDays={returnWindowDays}
      />

      <InvoiceDetailContent invoice={invoice} creditNotes={creditNotes} returnWindowDays={returnWindowDays} />
    </div>
  )
}
