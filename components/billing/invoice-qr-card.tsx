"use client"

type InvoiceQrCardProps = {
  dataUrl: string
  invoiceNumber: string
}

/**
 * Just the QR code — no invoice number/customer/date/total text alongside
 * it, since this renders inside the invoice's own info bar where all of
 * that is already shown. Scans straight to this invoice's own detail page,
 * generated fresh on every page load (no stored column), same as
 * components/inventory/stock/stock-qr-card.tsx's pattern.
 */
export function InvoiceQrCard({ dataUrl, invoiceNumber }: InvoiceQrCardProps) {
  return (
    <div className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt={`QR code for invoice ${invoiceNumber}`}
        className="h-14 w-14 shrink-0 rounded border"
        width={56}
        height={56}
      />
    </div>
  )
}
