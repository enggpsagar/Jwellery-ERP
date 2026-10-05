"use client"

import { useEffect, useState } from "react"
import { Printer, QrCode } from "lucide-react"

import {
  getStockTags,
  getStockTagSettings,
  type StockTagData,
  type StockTagSettings,
} from "@/lib/actions/inventory/stock-tag-actions"
import { StockBarcodeLabel } from "@/components/inventory/stock/stock-barcode-label"

import { Button } from "@/components/ui/button"
import { StockQrLabel, StockQrLabelPrintStyles } from "@/components/inventory/stock/stock-qr-label"
import { StockQrPrintRoot } from "@/components/inventory/stock/stock-qr-print-root"

type StockQrCardProps = {
  stockId: string
  dataUrl: string
}

export function StockQrCard({ stockId, dataUrl }: StockQrCardProps) {
  const [layout, setLayout] = useState<"qr" | "barcode">("qr")
  const [tagData, setTagData] = useState<{ tag: StockTagData; settings: StockTagSettings } | null>(null)

  // Both layouts print from the same tag data; refetched if the panel switches item.
  useEffect(() => {
    setTagData(null)
    let cancelled = false
    Promise.all([getStockTags([stockId]), getStockTagSettings()]).then(([tags, settings]) => {
      if (!cancelled && tags[0]) setTagData({ tag: tags[0], settings })
    })
    return () => {
      cancelled = true
    }
  }, [stockId])

  const tag = !tagData ? null : layout === "barcode" ? (
    <StockBarcodeLabel tag={tagData.tag} fields={tagData.settings.barcode} />
  ) : (
    <StockQrLabel tag={tagData.tag} qrDataUrl={dataUrl} fields={tagData.settings.qr} />
  )

  return (
    <section className="rounded-xl border bg-card p-5">
      {/* Prints just the tag, laid out for an 80mm thermal printer — same
          StockQrLabel as the bulk Print QR Codes page. */}
      <StockQrLabelPrintStyles />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <QrCode className="h-5 w-5" />
          Tag
        </h2>

        <div className="inline-flex rounded-lg border p-0.5 text-xs">
          {(["qr", "barcode"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setLayout(option)}
              className={`rounded-md px-2.5 py-1 ${layout === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {option === "qr" ? "QR" : "Barcode"}
            </button>
          ))}
        </div>

        <Button
          type="button"
          size="icon"
          title="Print"
          aria-label="Print"
          onClick={() => window.print()}
          disabled={!tagData}
          variant="outline"
          className="border-transparent bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700"
        >
          <Printer className="h-4 w-4" />
        </Button>
      </div>

      <div id="stock-qr-print" className="flex justify-center">
        {tag ?? <p className="text-sm text-muted-foreground">Loading tag…</p>}
      </div>
      <StockQrPrintRoot id="stock-qr-print-label">{tag}</StockQrPrintRoot>
    </section>
  )
}
