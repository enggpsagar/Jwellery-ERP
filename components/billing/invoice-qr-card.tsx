"use client"

import { Printer } from "lucide-react"

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
    <section className="rounded-xl border bg-card p-3">
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

      <div id="invoice-qr-print" className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUrl}
          alt={`QR code for invoice ${invoiceNumber}`}
          className="h-20 w-20 shrink-0"
          width={80}
          height={80}
        />

        <div className="min-w-0 flex-1 space-y-0.5 text-sm">
          <p className="font-semibold">{invoiceNumber}</p>
          {customerName && <p className="text-muted-foreground">{customerName}</p>}
          <p className="text-xs text-muted-foreground">
            {invoiceDate} · {totalAmount}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Print QR code"
          aria-label="Print QR code"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" />
        </Button>
      </div>
    </section>
  )
}
