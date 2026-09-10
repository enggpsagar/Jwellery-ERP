"use client"

import { useEffect, useState } from "react"
import { FileText } from "lucide-react"

import { getQuotationById, type Quotation } from "@/lib/actions/quotation-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { QuotationActionsBar } from "@/components/quotations/quotation-actions-bar"
import { QuotationDetailContent } from "@/components/quotations/quotation-detail-content"
import { Skeleton } from "@/components/ui/skeleton"

type QuotationDetailPanelProps = {
  quotationId: string | null
}

/**
 * The right-hand pane of the Quotations master-detail layout — fetches and
 * shows exactly what the standalone /quotations/[id] page shows (same
 * QuotationActionsBar/QuotationDetailContent), just inline next to the
 * list instead of a full navigation. Re-fetches whenever the selected id
 * changes — same convention as InvoiceDetailPanel/PurchaseDetailPanel.
 */
export function QuotationDetailPanel({ quotationId }: QuotationDetailPanelProps) {
  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [businessName, setBusinessName] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!quotationId) {
      setQuotation(null)
      return
    }

    let cancelled = false
    setLoading(true)
    Promise.all([getQuotationById(quotationId), getBusinessSettings()])
      .then(([quotationResult, settings]) => {
        if (cancelled) return
        setQuotation(quotationResult)
        setBusinessName(settings.businessName)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [quotationId])

  if (!quotationId) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <FileText className="h-8 w-8" />
        <p className="text-sm">Select a quotation to view its details.</p>
      </div>
    )
  }

  if (loading || !quotation) {
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
        <h2 className="text-lg font-semibold">{quotation.quotationNumber}</h2>
      </div>

      <QuotationActionsBar quotation={quotation} businessName={businessName} />

      <QuotationDetailContent quotation={quotation} />
    </div>
  )
}
