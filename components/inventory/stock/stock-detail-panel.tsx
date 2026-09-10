"use client"

import { useEffect, useState } from "react"
import { Boxes } from "lucide-react"
import QRCode from "qrcode"

import { getInventoryStockById } from "@/lib/actions/inventory/stock-actions"
import { StockRowActions } from "@/components/inventory/stock/stock-row-actions"
import { StockDetailContent } from "@/components/inventory/stock/stock-detail-content"
import { StockQrCard } from "@/components/inventory/stock/stock-qr-card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatShortDate } from "@/lib/utils"

type Stock = NonNullable<Awaited<ReturnType<typeof getInventoryStockById>>>

type StockDetailPanelProps = {
  stockId: string | null
}

/**
 * The right-hand pane of the Stock master-detail layout — fetches and shows
 * exactly what the standalone /inventory/stock/[id] page shows (same
 * StockDetailContent), just inline next to the list instead of a full
 * navigation. Re-fetches whenever the selected id changes; the selection
 * itself is cleared by the parent's own effect watching the stockItems prop.
 *
 * The QR code is generated client-side (against window.location.origin)
 * rather than server-side (against NEXTAUTH_URL, as the standalone page
 * does) — a client component can't read that server-only env var. Both
 * point at the same `/s/{id}` scan entry point either way.
 */
export function StockDetailPanel({ stockId }: StockDetailPanelProps) {
  const [stock, setStock] = useState<Stock | null>(null)
  const [loading, setLoading] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!stockId) {
      setStock(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setQrDataUrl(null)
    getInventoryStockById(stockId)
      .then((result) => {
        if (!cancelled) setStock(result)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [stockId])

  useEffect(() => {
    if (!stock) return

    let cancelled = false
    QRCode.toDataURL(`${window.location.origin}/s/${stock.id}`).then((url) => {
      if (!cancelled) setQrDataUrl(url)
    })

    return () => {
      cancelled = true
    }
  }, [stock])

  if (!stockId) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <Boxes className="h-8 w-8" />
        <p className="text-sm">Select a stock item to view its details.</p>
      </div>
    )
  }

  if (loading || !stock || !qrDataUrl) {
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
        <h2 className="text-lg font-semibold">
          {stock.product?.name ?? stock.stockCode}
        </h2>
        <StockRowActions stockId={stock.id} stockCode={stock.stockCode} />
      </div>

      <StockDetailContent
        stock={stock}
        qrCard={
          <StockQrCard
            dataUrl={qrDataUrl}
            stockCode={stock.stockCode}
            productCode={stock.product?.productCode ?? null}
            productName={stock.product?.name ?? "-"}
            tagNumber={stock.tagNumber || null}
            metalName={stock.metalType?.name ?? null}
            purity={stock.purity || null}
            netWeight={
              stock.netWeight ? `${Number(stock.netWeight).toFixed(3)}g` : null
            }
            grossWeight={
              stock.grossWeight
                ? `${Number(stock.grossWeight).toFixed(3)}g`
                : null
            }
            manufactureDate={
              stock.manufactureDate ? formatShortDate(stock.manufactureDate) : null
            }
          />
        }
      />
    </div>
  )
}
