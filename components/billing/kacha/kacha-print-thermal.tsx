import { amountInWords } from "@/lib/number-to-words"
import { formatShortDate } from "@/lib/utils"
import type { KachaInvoice } from "@/lib/actions/kacha-invoice-actions"
import type { BusinessSettings } from "@/lib/actions/settings-actions"

type KachaPrintThermalProps = {
  kachaInvoice: KachaInvoice
  settings: BusinessSettings
}

function fmt(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Same per-line qty/unit resolution as InvoicePrintThermal's own —
 * duplicated rather than shared, matching this codebase's convention of a
 * small pure per-file helper over a shared import for print-page logic. */
function lineQuantity(item: KachaInvoice["items"][number]) {
  if (item.purity === "DIAMOND" && item.caratWeight) {
    return { qty: item.caratWeight, unit: "Ct" }
  }
  if (item.netWeight && item.netWeight > 0) {
    return { qty: item.netWeight, unit: "Gm" }
  }
  return { qty: item.quantity || 1, unit: "Pcs" }
}

/**
 * Narrow 80mm receipt-printer layout for a Kacha Slip — a store's
 * alternative to the full A4 layouts (see BusinessSettings.printLayout).
 * Modeled directly on InvoicePrintThermal's own shape/sizing/@page rule,
 * minus every GST line: a Kacha Slip has no tax fields at all (no
 * taxAmount/sgst/cgst/igst, no HSN) — see KachaInvoice's own doc comment.
 */
export function KachaPrintThermal({ kachaInvoice, settings }: KachaPrintThermalProps) {
  const subtotal = kachaInvoice.subtotal + kachaInvoice.makingCharges + kachaInvoice.stoneCharges

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
        <p className="font-bold">Kacha Slip</p>
        {kachaInvoice.convertedTo && (
          <p className="text-[9px] italic">
            Converted to Tax Invoice {kachaInvoice.convertedTo.invoiceNumber}
          </p>
        )}
      </div>

      <div className="border-t border-dashed border-slate-500 pt-1">
        <div className="flex justify-between">
          <span>No: {kachaInvoice.slipNumber}</span>
          <span>{formatShortDate(kachaInvoice.invoiceDate)}</span>
        </div>
        {kachaInvoice.customer?.name && <p>Customer: {kachaInvoice.customer.name}</p>}
        {kachaInvoice.customer?.phone && <p>Ph: {kachaInvoice.customer.phone}</p>}
      </div>

      <div className="space-y-1 border-t border-dashed border-slate-500 pt-1">
        {kachaInvoice.items.map((item: KachaInvoice["items"][number]) => {
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
        {kachaInvoice.discount > 0 && (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-₹{fmt(kachaInvoice.discount)}</span>
          </div>
        )}
        {kachaInvoice.roundOffAmount !== 0 && (
          <div className="flex justify-between">
            <span>Round Off</span>
            <span>
              {kachaInvoice.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(kachaInvoice.roundOffAmount))}
            </span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-500 pt-0.5 font-bold">
          <span>Total</span>
          <span>₹{fmt(kachaInvoice.totalAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span>Received</span>
          <span>₹{fmt(kachaInvoice.paidAmount)}</span>
        </div>
        {kachaInvoice.balanceAmount > 0 && (
          <div className="flex justify-between font-bold">
            <span>Balance</span>
            <span>₹{fmt(kachaInvoice.balanceAmount)}</span>
          </div>
        )}
      </div>

      <div className="border-t border-dashed border-slate-500 pt-1 text-[9px]">
        <p>{amountInWords(kachaInvoice.totalAmount)}</p>
      </div>

      <p className="border-t border-dashed border-slate-500 pt-1 text-center">
        Thank you for your business!
      </p>
    </main>
  )
}
