import { amountInWords } from "@/lib/number-to-words"
import { formatShortDate } from "@/lib/utils"
import { documentHeading, COMPOSITION_DISCLAIMER } from "@/lib/gst"
import type { Invoice } from "@/lib/actions/invoice-actions"
import type { BusinessSettings } from "@/lib/actions/settings-actions"

type InvoicePrintThermalProps = {
  invoice: Invoice
  settings: BusinessSettings
}

function fmt(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Same per-line qty/unit resolution as the A4 layout's own lineQuantity —
 * duplicated rather than shared, matching this codebase's convention of a
 * small pure per-file helper over a shared import for print-page logic. */
function lineQuantity(item: Invoice["items"][number]) {
  if (item.purity === "DIAMOND" && item.caratWeight) {
    return { qty: item.caratWeight, unit: "Ct" }
  }
  if (item.netWeight && item.netWeight > 0) {
    return { qty: item.netWeight, unit: "Gm" }
  }
  return { qty: item.quantity || 1, unit: "Pcs" }
}

/**
 * Narrow 80mm receipt-printer layout — a store's alternative to the full
 * A4 InvoicePrintPage (see BusinessSettings.printLayout). Plain, no color
 * bands or logo (thermal printers are typically monochrome and can't print
 * a photo logo cleanly), one line per item rather than a full multi-column
 * table — a receipt printer's paper is too narrow for HSN/GST-per-line
 * columns to stay legible, so those collapse into a single GST summary line
 * at the bottom instead, same total figures as the A4 layout, just less
 * spread out.
 */
export function InvoicePrintThermal({ invoice, settings }: InvoicePrintThermalProps) {
  const heading = documentHeading(settings.gstScheme)
  const subtotal = invoice.subtotal + invoice.makingCharges + invoice.stoneCharges
  const isInterState = invoice.items.some((item) => item.igstAmount > 0)
  const totalSgst = invoice.items.reduce((sum, item) => sum + item.sgstAmount, 0)
  const totalCgst = invoice.items.reduce((sum, item) => sum + item.cgstAmount, 0)
  const totalIgst = invoice.items.reduce((sum, item) => sum + item.igstAmount, 0)

  return (
    <main className="mx-auto w-[80mm] space-y-2 bg-white p-2 font-mono text-[11px] leading-tight text-slate-900 print:w-full print:p-0">
      <style>
        {`@page { size: 80mm auto; margin: 3mm; }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }`}
      </style>

      <div className="space-y-0.5 text-center">
        <p className="text-sm font-bold uppercase">{settings.businessName}</p>
        {settings.address && <p>{settings.address}</p>}
        {(settings.city || settings.state) && (
          <p>{[settings.city, settings.state].filter(Boolean).join(", ")}</p>
        )}
        {settings.phone && <p>Ph: {settings.phone}</p>}
        {settings.gstNumber && <p>GSTIN: {settings.gstNumber}</p>}
      </div>

      <div className="border-t border-dashed border-slate-500 pt-1 text-center">
        <p className="font-bold">{heading}</p>
        {settings.gstScheme === "COMPOSITION" && (
          <p className="text-[9px] italic">{COMPOSITION_DISCLAIMER}</p>
        )}
      </div>

      <div className="border-t border-dashed border-slate-500 pt-1">
        <div className="flex justify-between">
          <span>No: {invoice.invoiceNumber}</span>
          <span>{formatShortDate(invoice.invoiceDate)}</span>
        </div>
        {invoice.customer?.name && <p>Customer: {invoice.customer.name}</p>}
        {invoice.customer?.phone && <p>Ph: {invoice.customer.phone}</p>}
      </div>

      <div className="space-y-1 border-t border-dashed border-slate-500 pt-1">
        {invoice.items.map((item) => {
          const { qty, unit } = lineQuantity(item)
          return (
            <div key={item.id}>
              <p className="font-medium">{item.itemName}</p>
              <div className="flex justify-between">
                <span>
                  {unit === "Pcs" ? qty : qty.toFixed(3)} {unit} x ₹{fmt(Number(item.rate ?? 0))}
                </span>
                <span>₹{fmt(item.lineTotal)}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="space-y-0.5 border-t border-dashed border-slate-500 pt-1">
        <div className="flex justify-between">
          <span>Sub Total</span>
          <span>₹{fmt(subtotal)}</span>
        </div>
        {invoice.discount > 0 && (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-₹{fmt(invoice.discount)}</span>
          </div>
        )}
        {isInterState
          ? totalIgst > 0 && (
              <div className="flex justify-between">
                <span>IGST</span>
                <span>₹{fmt(totalIgst)}</span>
              </div>
            )
          : (totalSgst > 0 || totalCgst > 0) && (
              <>
                <div className="flex justify-between">
                  <span>SGST</span>
                  <span>₹{fmt(totalSgst)}</span>
                </div>
                <div className="flex justify-between">
                  <span>CGST</span>
                  <span>₹{fmt(totalCgst)}</span>
                </div>
              </>
            )}
        {invoice.roundOffAmount !== 0 && (
          <div className="flex justify-between">
            <span>Round Off</span>
            <span>
              {invoice.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(invoice.roundOffAmount))}
            </span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-500 pt-0.5 font-bold">
          <span>Total</span>
          <span>₹{fmt(invoice.totalAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span>Received</span>
          <span>₹{fmt(invoice.paidAmount)}</span>
        </div>
        {invoice.balanceAmount > 0 && (
          <div className="flex justify-between font-bold">
            <span>Balance</span>
            <span>₹{fmt(invoice.balanceAmount)}</span>
          </div>
        )}
      </div>

      <div className="border-t border-dashed border-slate-500 pt-1 text-[9px]">
        <p>{amountInWords(invoice.totalAmount)}</p>
      </div>

      <p className="border-t border-dashed border-slate-500 pt-1 text-center">
        Thank you for your business!
      </p>
    </main>
  )
}
