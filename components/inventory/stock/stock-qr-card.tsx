"use client"

import { Printer, QrCode } from "lucide-react"

import { Button } from "@/components/ui/button"
import { StockQrLabel, StockQrLabelPrintStyles } from "@/components/inventory/stock/stock-qr-label"
import { StockQrPrintRoot } from "@/components/inventory/stock/stock-qr-print-root"

type StockQrCardProps = {
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
  return (
    <section className="rounded-xl border bg-card p-5">
      {/* Prints just the tag, laid out for an 80mm thermal printer — same
          StockQrLabel as the bulk Print QR Codes page. */}
      <StockQrLabelPrintStyles />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <QrCode className="h-5 w-5" />
          QR Code
        </h2>

        <Button
          type="button"
          size="icon"
          title="Print"
          aria-label="Print"
          onClick={() => window.print()}
          variant="outline"
          className="border-transparent bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700"
        >
          <Printer className="h-4 w-4" />
        </Button>
      </div>

      <div id="stock-qr-print" className="flex justify-center">
        <StockQrLabel
          label={{
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
          }}
        />
      </div>
      <StockQrPrintRoot id="stock-qr-print-label">
        <StockQrLabel
          label={{
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
          }}
        />
      </StockQrPrintRoot>
    </section>
  )
}
