"use client"

import { useEffect, useState } from "react"
import { Printer, QrCode } from "lucide-react"

import {
  getStockBarcodeTags,
  type StockBarcodeTagData,
} from "@/lib/actions/inventory/stock-tag-actions"
import { StockBarcodeLabel } from "@/components/inventory/stock/stock-barcode-label"

import { Button } from "@/components/ui/button"
import { StockQrLabel, StockQrLabelPrintStyles } from "@/components/inventory/stock/stock-qr-label"
import { StockQrPrintRoot } from "@/components/inventory/stock/stock-qr-print-root"

type StockQrCardProps = {
  stockId: string
  dataUrl: string
  stockCode: string
  productCode: string | null
  productName: string
  tagNumber: string | null
  metalName: string | null
  purity: string | null
  netWeight: string | null
  grossWeight: string | null
  manufactureDate: string | null
}

export function StockQrCard({
  stockId,
  dataUrl,
  stockCode,
  productCode,
  productName,
  tagNumber,
  metalName,
  purity,
  netWeight,
  grossWeight,
  manufactureDate,
}: StockQrCardProps) {
  const [layout, setLayout] = useState<"qr" | "barcode">("qr")
  const [barcodeTag, setBarcodeTag] = useState<StockBarcodeTagData | null>(null)

  // Fetched only once Barcode is picked, and again if the panel switches item.
  useEffect(() => {
    setBarcodeTag(null)
    if (layout !== "barcode") return
    let cancelled = false
    getStockBarcodeTags([stockId]).then((tags) => {
      if (!cancelled) setBarcodeTag(tags[0] ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [layout, stockId])

  const qrLabel = {
    qrDataUrl: dataUrl,
    stockCode,
    tagNumber,
    productName,
    productCode,
    metalName,
    purity,
    netWeight,
    grossWeight,
    manufactureDate,
  }
  const tag =
    layout === "barcode" ? (
      barcodeTag ? <StockBarcodeLabel tag={barcodeTag} /> : null
    ) : (
      <StockQrLabel label={qrLabel} />
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
          disabled={layout === "barcode" && !barcodeTag}
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
