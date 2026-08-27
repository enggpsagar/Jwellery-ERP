"use client"

import { Printer, QrCode } from "lucide-react"

import { Button } from "@/components/ui/button"

type StockQrCardProps = {
  dataUrl: string
  stockCode: string
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
      {/*
        Scoped print stylesheet: this is the only place in the app that
        prints anything, so the rule is kept fully self-contained here
        (id-scoped) instead of a shared/global stylesheet, so it can never
        leak onto any other page.
      */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #stock-qr-print,
          #stock-qr-print * {
            visibility: visible;
          }
          #stock-qr-print {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }
        }
      `}</style>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <QrCode className="h-5 w-5" />
          QR Code
        </h2>

        <Button type="button" size="sm" className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>

      <div id="stock-qr-print" className="flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUrl}
          alt={`QR code for stock ${stockCode}`}
          className="h-40 w-40"
          width={160}
          height={160}
        />
        <div>
          <p className="font-semibold">LR# {tagNumber ?? stockCode}</p>
          <p className="text-sm text-muted-foreground">{productName}</p>
        </div>

        <div className="w-full max-w-[220px] space-y-0.5 text-left text-xs text-muted-foreground">
          {metalName && (
            <p>
              <span className="font-medium text-foreground">Metal:</span>{" "}
              {metalName}
            </p>
          )}
          {purity && (
            <p>
              <span className="font-medium text-foreground">Purity:</span>{" "}
              {purity}
            </p>
          )}
          {netWeight && (
            <p>
              <span className="font-medium text-foreground">Net Weight:</span>{" "}
              {netWeight}
            </p>
          )}
          {grossWeight && (
            <p>
              <span className="font-medium text-foreground">Gross Weight:</span>{" "}
              {grossWeight}
            </p>
          )}
          {manufactureDate && <p>MFG: {manufactureDate}</p>}
        </div>
      </div>
    </section>
  )
}
