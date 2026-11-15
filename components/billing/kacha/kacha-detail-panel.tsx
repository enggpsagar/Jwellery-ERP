"use client"

import { useEffect, useState } from "react"

import { getKachaInvoiceById } from "@/lib/actions/kacha-invoice-actions"
import { getKachaOldGoldExchange } from "@/lib/actions/old-gold-actions"
import {
  KachaDetailActions,
  KachaDetailContent,
  type KachaInvoiceDetail,
  type KachaOldGoldExchange,
} from "@/components/billing/kacha/kacha-detail-content"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * An estimate fetched and shown inline — what the standalone
 * /billing/kacha/[id] page shows (same KachaDetailActions/
 * KachaDetailContent), for the Estimates list's pop-up. Re-fetches whenever
 * the id changes, same convention as InvoiceDetailPanel.
 */
export function KachaDetailPanel({ kachaInvoiceId }: { kachaInvoiceId: string | null }) {
  const [kachaInvoice, setKachaInvoice] = useState<KachaInvoiceDetail | null>(null)
  const [oldGoldExchange, setOldGoldExchange] = useState<KachaOldGoldExchange>(null)
  const [loading, setLoading] = useState(false)
  // Set once a fetch has finished without an estimate (not found / failed),
  // so the panel says so instead of showing the skeleton forever.
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!kachaInvoiceId) {
      setKachaInvoice(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setMissing(false)
    Promise.all([getKachaInvoiceById(kachaInvoiceId), getKachaOldGoldExchange(kachaInvoiceId)])
      .then(([invoiceResult, exchangeResult]) => {
        if (cancelled) return
        setKachaInvoice(invoiceResult)
        setOldGoldExchange(exchangeResult)
        setMissing(!invoiceResult)
      })
      .catch(() => {
        if (cancelled) return
        setKachaInvoice(null)
        setMissing(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [kachaInvoiceId])

  if (!kachaInvoiceId) return null

  if (!loading && missing) {
    return <p className="text-sm text-muted-foreground">This estimate couldn&apos;t be loaded.</p>
  }

  if (loading || !kachaInvoice) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{kachaInvoice.slipNumber}</h2>
          {kachaInvoice.customer?.name ? (
            <p className="text-sm text-muted-foreground">{kachaInvoice.customer.name}</p>
          ) : null}
        </div>
        <KachaDetailActions kachaInvoice={kachaInvoice} />
      </div>

      <KachaDetailContent kachaInvoice={kachaInvoice} oldGoldExchange={oldGoldExchange} />
    </div>
  )
}
