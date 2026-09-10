import { amountInWords } from "@/lib/number-to-words"
import { formatShortDate } from "@/lib/utils"
import { COMPOSITION_DISCLAIMER } from "@/lib/gst"
import type { Quotation } from "@/lib/actions/quotation-actions"
import type { BusinessSettings } from "@/lib/actions/settings-actions"
import { APP_NAME } from "@/lib/constants/app"

type QuotationPrintModernProps = {
  quotation: Quotation
  settings: BusinessSettings
}

function fmt(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(value: string) {
  return formatShortDate(value)
}

/** Duplicated from QuotationStatusBadge's own map — see quotation-print-
 * classic.tsx's identical copy for why this is per-file, not shared. */
const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  converted: "Converted",
  expired: "Expired",
}

type QuotationItem = Quotation["items"][number]

/** Same three cases as quotation-print-classic.tsx's own lineQuantity —
 * duplicated per this codebase's per-file helper convention. */
function lineQuantity(item: QuotationItem) {
  if (item.purity === "DIAMOND" && item.caratWeight) {
    return { qty: item.caratWeight, unit: "Ct", pricePerUnit: item.rate ?? 0, isWeighed: true }
  }
  if (item.netWeight && item.netWeight > 0) {
    return { qty: item.netWeight, unit: "Gm", pricePerUnit: item.rate ?? 0, isWeighed: true }
  }
  const qty = item.quantity || 1
  return { qty, unit: "Pcs", pricePerUnit: item.rate ?? item.lineTotal / qty, isWeighed: false }
}

// Quotation is typed off mapQuotation()'s untyped (`any`) intermediate
// object, so `quotation.items` itself resolves to `any` — an explicit
// annotation on every inline callback below is required to avoid
// noImplicitAny errors, same convention quotation-detail-content.tsx
// already uses for its own QuotationItem-typed callbacks.
type LineQuantity = ReturnType<typeof lineQuantity>

/** Same derivation as quotation-print-classic.tsx's own effectiveGstPercent. */
function effectiveGstPercent(quotation: Quotation) {
  if (quotation.gstRatePercent != null) return quotation.gstRatePercent
  const taxable = quotation.subtotal + quotation.makingCharges + quotation.stoneCharges - quotation.discount
  if (taxable > 0 && quotation.taxAmount > 0) {
    return Math.round((quotation.taxAmount / taxable) * 10000) / 100
  }
  return null
}

/**
 * The Quotation document's Modern template — light and airy, per
 * InvoiceTemplate's own schema doc comment: indigo used only as a thin
 * underline beneath the business name and as the Total row's background
 * tint, no color bands or curved shapes anywhere else. Alternating white/
 * slate-50 item rows under a plain (unfilled) header row with just a
 * bottom border. Same document-level-GST-only / no-payment-rows
 * differences from Invoice's own Modern as quotation-print-classic.tsx
 * has from Invoice's Classic.
 */
export function QuotationPrintModern({ quotation, settings }: QuotationPrintModernProps) {
  const businessAddressLines = [
    settings.address,
    [settings.city, settings.state].filter(Boolean).join(", "),
  ].filter(Boolean)

  const customerAddressLines = [
    quotation.customer?.addressLine1,
    quotation.customer?.addressLine2,
    [quotation.customer?.city, quotation.customer?.state].filter(Boolean).join(", "),
    quotation.customer?.pincode,
  ].filter(Boolean)

  const hasBankDetails = Boolean(settings.bankName)
  const isInterState = quotation.igstAmount > 0
  const hasGst = quotation.taxAmount > 0
  const gstPercent = effectiveGstPercent(quotation)
  const subtotal = quotation.subtotal + quotation.makingCharges + quotation.stoneCharges

  return (
    <main className="mx-auto max-w-3xl space-y-4 bg-white p-6 text-[13px] text-slate-900 print:max-w-none print:w-full print:p-0 print:text-[10px]">
      <style>
        {`@page { size: A4 portrait; margin: 10mm; }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }`}
      </style>

      <div className="overflow-hidden border border-slate-200 bg-white print:border-slate-400">
        {/* Plain business identity — no dark block, no logo band, just bold
            name + gray GSTIN/state text + a thin indigo rule beneath. */}
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="space-y-0.5">
            <p className="text-2xl font-bold text-slate-900">{settings.businessName}</p>
            <div className="mb-1 h-0.5 w-16 bg-indigo-500" />
            {settings.gstNumber && <p className="text-[11px] text-slate-500">GSTIN: {settings.gstNumber}</p>}
            {settings.state && (
              <p className="text-[11px] text-slate-500">
                State: {settings.stateCode ? `${settings.stateCode}-` : ""}
                {settings.state}
              </p>
            )}
            {businessAddressLines.length > 0 && (
              <p className="text-[11px] text-slate-500">{businessAddressLines.join(", ")}</p>
            )}
            {(settings.phone || settings.email) && (
              <p className="text-[11px] text-slate-500">
                {[settings.phone, settings.email].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-slate-900">Quotation</p>
            {settings.gstScheme === "COMPOSITION" && (
              <p className="max-w-[220px] text-[10px] italic text-slate-500">{COMPOSITION_DISCLAIMER}</p>
            )}
          </div>
        </div>

        {/* Bill To / quotation meta */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="space-y-0.5">
            <p className="font-semibold text-indigo-600">Bill To</p>
            <p className="text-base font-bold">{quotation.customer?.name ?? "-"}</p>
            {customerAddressLines.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            {quotation.customer?.phone && <p>Contact No.: {quotation.customer.phone}</p>}
          </div>
          <div className="space-y-0.5 text-right">
            <p>
              <span className="font-semibold">Quotation No.:</span> {quotation.quotationNumber}
            </p>
            <p>
              <span className="font-semibold">Date:</span> {fmtDate(quotation.quotationDate)}
            </p>
            {quotation.validUntil && (
              <p>
                <span className="font-semibold">Valid Until:</span> {fmtDate(quotation.validUntil)}
              </p>
            )}
            <p>
              <span className="font-semibold">Status:</span> {STATUS_LABELS[quotation.status] ?? quotation.status}
            </p>
          </div>
        </div>

        {/* Line items — no fill on the header row, just a bottom border;
            alternating white/slate-50 rows. */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-300 [&>th]:p-2 [&>th]:text-left [&>th]:align-middle [&>th]:text-[11px] [&>th]:font-semibold [&>th]:normal-case [&>th]:tracking-normal [&>th]:whitespace-normal [&>th]:text-slate-700">
              <th className="w-6">#</th>
              <th>Item name</th>
              <th className="text-right">Quantity</th>
              <th>Unit</th>
              <th className="text-right">Price/ Unit</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((item: QuotationItem, index: number) => {
              const { qty, unit, pricePerUnit } = lineQuantity(item)
              return (
                <tr key={item.id} className="[&>td]:p-2 align-top odd:bg-white even:bg-slate-50">
                  <td>{index + 1}</td>
                  <td className="font-medium">{item.itemName}</td>
                  <td className="text-right whitespace-nowrap">{unit === "Pcs" ? qty : qty.toFixed(3)}</td>
                  <td>{unit}</td>
                  <td className="text-right whitespace-nowrap">₹{fmt(pricePerUnit)}</td>
                  <td className="text-right whitespace-nowrap font-medium">₹{fmt(item.lineTotal)}</td>
                </tr>
              )
            })}
            <tr className="border-t-2 border-slate-300 font-semibold [&>td]:p-2">
              <td colSpan={2} className="text-right">
                Total
              </td>
              <td className="text-right whitespace-nowrap">
                {(quotation.items.map(lineQuantity) as LineQuantity[])
                  .filter((line) => line.isWeighed)
                  .reduce((sum, line) => sum + line.qty, 0)
                  .toFixed(3)}
              </td>
              <td />
              <td />
              <td className="text-right whitespace-nowrap">₹{fmt(quotation.totalAmount)}</td>
            </tr>
          </tbody>
        </table>

        {quotation.convertedToId && quotation.convertedTo && (
          <div className="border-b border-slate-200 bg-green-50 p-3 text-green-800">
            This quotation has been converted to Invoice {quotation.convertedTo.invoiceNumber}.
          </div>
        )}

        {/* Pay To (left) / totals (right) */}
        <div className="grid grid-cols-2 gap-6 p-5">
          <div className="space-y-4">
            {hasBankDetails && (
              <div>
                <p className="font-medium text-indigo-600">Pay To</p>
                {settings.bankName && <p>Bank Name : {settings.bankName}</p>}
                {settings.bankAccountNumber && <p>Bank Account No. : {settings.bankAccountNumber}</p>}
                {settings.bankIfscCode && <p>Bank IFSC code : {settings.bankIfscCode}</p>}
                {settings.bankAccountHolderName && (
                  <p>Account holder&apos;s name : {settings.bankAccountHolderName}</p>
                )}
              </div>
            )}

            <div>
              <p className="font-medium text-indigo-600">Quotation Amount In Words</p>
              <p>{amountInWords(quotation.totalAmount)}</p>
            </div>

            <div className="pt-6">
              <p>For : {settings.businessName}</p>
              <div className="mt-10 w-40 border-t border-slate-400 pt-1 text-[10px] font-medium">
                Authorized Signatory
              </div>
            </div>
          </div>

          <div className="justify-self-end w-full max-w-[260px] overflow-hidden rounded-sm border border-slate-300">
            <div className="flex justify-between border-b border-slate-200 p-1.5">
              <span>Sub Total</span>
              <span>₹{fmt(subtotal)}</span>
            </div>
            {quotation.discount > 0 && (
              <div className="flex justify-between border-b border-slate-200 p-1.5">
                <span>Discount</span>
                <span>-₹{fmt(quotation.discount)}</span>
              </div>
            )}
            {hasGst &&
              (isInterState ? (
                <div className="flex justify-between border-b border-slate-200 p-1.5">
                  <span>IGST{gstPercent != null ? `@${gstPercent}%` : ""}</span>
                  <span>₹{fmt(quotation.igstAmount)}</span>
                </div>
              ) : (
                <div className="flex flex-col border-b border-slate-200">
                  <div className="flex justify-between p-1.5">
                    <span>SGST{gstPercent != null ? `@${(gstPercent / 2).toFixed(2)}%` : ""}</span>
                    <span>₹{fmt(quotation.sgstAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 p-1.5">
                    <span>CGST{gstPercent != null ? `@${(gstPercent / 2).toFixed(2)}%` : ""}</span>
                    <span>₹{fmt(quotation.cgstAmount)}</span>
                  </div>
                </div>
              ))}
            {quotation.roundOffAmount !== 0 && (
              <div className="flex justify-between border-b border-slate-200 p-1.5">
                <span>Round Off</span>
                <span>
                  {quotation.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(quotation.roundOffAmount))}
                </span>
              </div>
            )}
            <div className="flex justify-between bg-indigo-50 p-1.5 font-semibold text-indigo-700">
              <span>Total</span>
              <span>₹{fmt(quotation.totalAmount)}</span>
            </div>
          </div>
        </div>

        {quotation.notes && (
          <div className="border-t border-slate-200 p-5">
            <p className="font-semibold">Notes</p>
            <p className="whitespace-pre-wrap">{quotation.notes}</p>
          </div>
        )}

        {settings.invoiceTerms && (
          <div className="border-t border-slate-200 p-5">
            <p className="font-semibold">Terms & Conditions</p>
            <p className="whitespace-pre-wrap">{settings.invoiceTerms}</p>
          </div>
        )}
      </div>

      <p className="text-center text-[9px] text-gray-500 print:text-[7px]">Generated with {APP_NAME}</p>
    </main>
  )
}
