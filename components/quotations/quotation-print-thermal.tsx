import { amountInWords } from "@/lib/number-to-words"
import { formatShortDate } from "@/lib/utils"
import { COMPOSITION_DISCLAIMER } from "@/lib/gst"
import type { Quotation } from "@/lib/actions/quotation-actions"
import type { BusinessSettings } from "@/lib/actions/settings-actions"

type QuotationPrintThermalProps = {
  quotation: Quotation
  settings: BusinessSettings
}

function fmt(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Same per-line qty/unit resolution as InvoicePrintThermal's own
 * lineQuantity — duplicated rather than shared, matching this codebase's
 * convention of a small pure per-file helper over a shared import for
 * print-page logic. */
type QuotationItem = Quotation["items"][number]

function lineQuantity(item: QuotationItem) {
  if (item.purity === "DIAMOND" && item.caratWeight) {
    return { qty: item.caratWeight, unit: "Ct" }
  }
  if (item.netWeight && item.netWeight > 0) {
    return { qty: item.netWeight, unit: "Gm" }
  }
  return { qty: item.quantity || 1, unit: "Pcs" }
}

/** Same derivation as quotation-print-classic.tsx's own effectiveGstPercent
 * — duplicated per this codebase's per-file helper convention. */
function effectiveGstPercent(quotation: Quotation) {
  if (quotation.gstRatePercent != null) return quotation.gstRatePercent
  const taxable = quotation.subtotal + quotation.makingCharges + quotation.stoneCharges - quotation.discount
  if (taxable > 0 && quotation.taxAmount > 0) {
    return Math.round((quotation.taxAmount / taxable) * 10000) / 100
  }
  return null
}

/**
 * Narrow 80mm receipt-printer layout for a Quotation — a store's
 * alternative to the full A4 QuotationPrint* templates (see
 * BusinessSettings.printLayout), modeled on InvoicePrintThermal's own
 * shape/sizing/@page rule. One GST summary line rather than per-item
 * (Quotation's tax lives at the document level only, so there was never a
 * per-line breakdown to collapse in the first place — unlike Invoice's
 * thermal layout, which does collapse one), and no Received/Balance rows
 * since a quotation carries no payment fields at all.
 */
export function QuotationPrintThermal({ quotation, settings }: QuotationPrintThermalProps) {
  const subtotal = quotation.subtotal + quotation.makingCharges + quotation.stoneCharges
  const isInterState = quotation.igstAmount > 0
  const hasGst = quotation.taxAmount > 0
  const gstPercent = effectiveGstPercent(quotation)

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
        <p className="font-bold">Quotation</p>
        {settings.gstScheme === "COMPOSITION" && (
          <p className="text-[9px] italic">{COMPOSITION_DISCLAIMER}</p>
        )}
      </div>

      <div className="border-t border-dashed border-slate-500 pt-1">
        <div className="flex justify-between">
          <span>No: {quotation.quotationNumber}</span>
          <span>{formatShortDate(quotation.quotationDate)}</span>
        </div>
        {quotation.validUntil && <p>Valid Until: {formatShortDate(quotation.validUntil)}</p>}
        {quotation.customer?.name && <p>Customer: {quotation.customer.name}</p>}
        {quotation.customer?.phone && <p>Ph: {quotation.customer.phone}</p>}
      </div>

      <div className="space-y-1 border-t border-dashed border-slate-500 pt-1">
        {quotation.items.map((item: QuotationItem) => {
          const { qty, unit } = lineQuantity(item)
          return (
            <div key={item.id}>
              <p className="font-medium">{item.itemName}</p>
              <div className="flex justify-between">
                <span>
                  {unit === "Pcs" ? qty : qty.toFixed(3)} {unit} x ₹{fmt(item.rate ?? 0)}
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
        {quotation.discount > 0 && (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-₹{fmt(quotation.discount)}</span>
          </div>
        )}
        {hasGst &&
          (isInterState ? (
            <div className="flex justify-between">
              <span>IGST{gstPercent != null ? `@${gstPercent}%` : ""}</span>
              <span>₹{fmt(quotation.igstAmount)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between">
                <span>SGST{gstPercent != null ? `@${(gstPercent / 2).toFixed(2)}%` : ""}</span>
                <span>₹{fmt(quotation.sgstAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span>CGST{gstPercent != null ? `@${(gstPercent / 2).toFixed(2)}%` : ""}</span>
                <span>₹{fmt(quotation.cgstAmount)}</span>
              </div>
            </>
          ))}
        {quotation.roundOffAmount !== 0 && (
          <div className="flex justify-between">
            <span>Round Off</span>
            <span>
              {quotation.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(quotation.roundOffAmount))}
            </span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-500 pt-0.5 font-bold">
          <span>Total</span>
          <span>₹{fmt(quotation.totalAmount)}</span>
        </div>
      </div>

      {quotation.convertedToId && quotation.convertedTo && (
        <p className="border-t border-dashed border-slate-500 pt-1 text-center text-[9px]">
          Converted to Invoice {quotation.convertedTo.invoiceNumber}
        </p>
      )}

      <div className="border-t border-dashed border-slate-500 pt-1 text-[9px]">
        <p>{amountInWords(quotation.totalAmount)}</p>
      </div>

      <p className="border-t border-dashed border-slate-500 pt-1 text-center">
        Thank you for your business!
      </p>
    </main>
  )
}
