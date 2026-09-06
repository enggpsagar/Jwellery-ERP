"use client"

import { Printer, QrCode } from "lucide-react"

import { Button } from "@/components/ui/button"

type InvoiceQrCardProps = {
  dataUrl: string
  invoiceNumber: string
  customerName: string | null
  invoiceDate: string
  totalAmount: string
}

/**
 * Scans straight to this invoice's own detail page — mirrors
 * components/inventory/stock/stock-qr-card.tsx's structure (same
 * scoped-print pattern, same layout), just for an Invoice instead of an
 * InventoryStock row. Generated fresh on every page load (see the
 * invoice detail page's own QRCode.toDataURL call) rather than stored,
 * same as the stock QR — nothing about the target URL ever changes.
 */
export function InvoiceQrCard({
  dataUrl,
  invoiceNumber,
  customerName,
  invoiceDate,
  totalAmount,
}: InvoiceQrCardProps) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #invoice-qr-print,
          #invoice-qr-print * {
            visibility: visible;
          }
          #invoice-qr-print {
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

      <div id="invoice-qr-print" className="flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUrl}
          alt={`QR code for invoice ${invoiceNumber}`}
          className="h-40 w-40"
          width={160}
          height={160}
        />
        <div>
          <p className="font-semibold">{invoiceNumber}</p>
          {customerName && <p className="text-sm text-muted-foreground">{customerName}</p>}
        </div>

        <div className="w-full max-w-[220px] space-y-0.5 text-left text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Date:</span> {invoiceDate}
          </p>
          <p>
            <span className="font-medium text-foreground">Total:</span> {totalAmount}
          </p>
        </div>
      </div>
    </section>
  )
}
