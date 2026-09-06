"use client"

import { Printer } from "lucide-react"

import { Button } from "@/components/ui/button"

type InvoiceQrCardProps = {
  dataUrl: string
  invoiceNumber: string
}

/**
 * Just the QR + a print action — no invoice number/customer/date/total
 * text alongside it, since this renders inside the invoice's own info bar
 * where all of that is already shown. Scans straight to this invoice's own
 * detail page, generated fresh on every page load (no stored column), same
 * as components/inventory/stock/stock-qr-card.tsx's pattern.
 */
export function InvoiceQrCard({ dataUrl, invoiceNumber }: InvoiceQrCardProps) {
  return (
    <div className="flex items-center gap-2">
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
          }
        }
      `}</style>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        id="invoice-qr-print"
        src={dataUrl}
        alt={`QR code for invoice ${invoiceNumber}`}
        className="h-14 w-14 shrink-0 rounded border"
        width={56}
        height={56}
      />

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
  )
}
