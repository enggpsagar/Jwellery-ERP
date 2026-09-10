import { Mail, MapPin, Phone } from "lucide-react"
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

/** Status pill fill for the header band — blue for an open quotation,
 * gray once converted, amber-red once expired. Per-file, same convention
 * as STATUS_LABELS above. */
const STATUS_PILL_CLASSES: Record<string, string> = {
  open: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  converted: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-300",
  expired: "bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200",
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
 * The Quotation document's Modern template — a premium SaaS-billing look
 * (Stripe/Linear-style), matching Invoice's own Modern for visual
 * consistency across the two documents: an indigo gradient header band
 * (rounded-top printable card) carrying business identity on the left and
 * the "Quotation" heading + a status-derived colored pill on the right,
 * lucide Phone/Mail/MapPin icons beside contact details, a rounded items
 * table with an indigo-50 header fill and indigo-50/white alternating
 * rows, and a rounded totals card whose Total row repeats the header
 * gradient in bold white text. An optional faint, print-safe logoUrl
 * watermark sits behind the whole card. Same document-level-GST-only /
 * no-payment-rows differences from Invoice's own Modern as quotation-
 * print-classic.tsx has from Invoice's Classic.
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
  const statusPillClass = STATUS_PILL_CLASSES[quotation.status] ?? STATUS_PILL_CLASSES.converted

  return (
    <main className="mx-auto max-w-3xl space-y-4 bg-white p-6 text-[13px] text-slate-900 print:max-w-none print:w-full print:p-0 print:text-[10px]">
      <style>
        {`@page { size: A4 portrait; margin: 10mm; }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }`}
      </style>

      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg print:rounded-none print:border-slate-400 print:shadow-none">
        {settings.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={settings.logoUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 m-auto h-[360px] w-[360px] object-contain opacity-[0.14]"
          />
        )}

        <div className="relative z-10">
          {/* Header band — indigo gradient, white text, business identity
              left / Quotation heading + status pill right. */}
          <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-indigo-600 to-indigo-400 px-6 py-5 text-white">
            <div className="space-y-1.5">
              <p className="text-2xl font-bold">{settings.businessName}</p>
              <div className="space-y-0.5 text-[11px] text-indigo-50/90">
                {settings.gstNumber && <p>GSTIN: {settings.gstNumber}</p>}
                {settings.state && (
                  <p>
                    State: {settings.stateCode ? `${settings.stateCode}-` : ""}
                    {settings.state}
                  </p>
                )}
                {businessAddressLines.length > 0 && (
                  <p className="flex items-start gap-1">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{businessAddressLines.join(", ")}</span>
                  </p>
                )}
                {settings.phone && (
                  <p className="flex items-center gap-1">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span>{settings.phone}</span>
                  </p>
                )}
                {settings.email && (
                  <p className="flex items-center gap-1">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span>{settings.email}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2 text-right">
              <p className="text-2xl font-semibold">Quotation</p>
              <span
                className={`inline-block rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusPillClass}`}
              >
                {STATUS_LABELS[quotation.status] ?? quotation.status}
              </span>
              {settings.gstScheme === "COMPOSITION" && (
                <p className="max-w-[220px] text-[10px] italic text-indigo-50/80">{COMPOSITION_DISCLAIMER}</p>
              )}
            </div>
          </div>

          {/* Bill To / quotation meta */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
            <div className="space-y-0.5">
              <p className="font-semibold text-indigo-600">Bill To</p>
              <p className="text-base font-bold">{quotation.customer?.name ?? "-"}</p>
              {customerAddressLines.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
              {quotation.customer?.phone && (
                <p className="flex items-center gap-1">
                  <Phone className="h-3 w-3 shrink-0 text-slate-400" />
                  <span>{quotation.customer.phone}</span>
                </p>
              )}
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

          {/* Line items — rounded container, indigo-50 header fill,
              indigo-50/white alternating rows, comfortable row padding. */}
          <div className="mx-6 my-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-indigo-50 [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:align-middle [&>th]:text-[11px] [&>th]:font-semibold [&>th]:normal-case [&>th]:tracking-normal [&>th]:whitespace-normal [&>th]:text-indigo-900">
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
                    <tr
                      key={item.id}
                      className="align-top odd:bg-white even:bg-indigo-50/40 [&>td]:px-3 [&>td]:py-2.5"
                    >
                      <td>{index + 1}</td>
                      <td className="font-medium">{item.itemName}</td>
                      <td className="text-right whitespace-nowrap">{unit === "Pcs" ? qty : qty.toFixed(3)}</td>
                      <td>{unit}</td>
                      <td className="text-right whitespace-nowrap">₹{fmt(pricePerUnit)}</td>
                      <td className="text-right whitespace-nowrap font-medium">₹{fmt(item.lineTotal)}</td>
                    </tr>
                  )
                })}
                <tr className="border-t-2 border-indigo-200 bg-indigo-50/60 font-semibold [&>td]:px-3 [&>td]:py-2.5">
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
          </div>

          {quotation.convertedToId && quotation.convertedTo && (
            <div className="mx-6 mb-4 rounded-lg bg-green-50 p-3 text-green-800">
              This quotation has been converted to Invoice {quotation.convertedTo.invoiceNumber}.
            </div>
          )}

          {/* Pay To (left) / totals (right) */}
          <div className="grid grid-cols-2 gap-6 px-6 pb-5">
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

            <div className="justify-self-end w-full max-w-[260px] overflow-hidden rounded-lg border border-slate-200 shadow-sm">
              <div className="flex justify-between border-b border-slate-100 p-2.5">
                <span>Sub Total</span>
                <span>₹{fmt(subtotal)}</span>
              </div>
              {quotation.discount > 0 && (
                <div className="flex justify-between border-b border-slate-100 p-2.5">
                  <span>Discount</span>
                  <span>-₹{fmt(quotation.discount)}</span>
                </div>
              )}
              {hasGst &&
                (isInterState ? (
                  <div className="flex justify-between border-b border-slate-100 p-2.5">
                    <span>IGST{gstPercent != null ? `@${gstPercent}%` : ""}</span>
                    <span>₹{fmt(quotation.igstAmount)}</span>
                  </div>
                ) : (
                  <div className="flex flex-col border-b border-slate-100">
                    <div className="flex justify-between p-2.5">
                      <span>SGST{gstPercent != null ? `@${(gstPercent / 2).toFixed(2)}%` : ""}</span>
                      <span>₹{fmt(quotation.sgstAmount)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-100 p-2.5">
                      <span>CGST{gstPercent != null ? `@${(gstPercent / 2).toFixed(2)}%` : ""}</span>
                      <span>₹{fmt(quotation.cgstAmount)}</span>
                    </div>
                  </div>
                ))}
              {quotation.roundOffAmount !== 0 && (
                <div className="flex justify-between border-b border-slate-100 p-2.5">
                  <span>Round Off</span>
                  <span>
                    {quotation.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(quotation.roundOffAmount))}
                  </span>
                </div>
              )}
              <div className="flex justify-between bg-gradient-to-r from-indigo-600 to-indigo-400 p-2.5 font-bold text-white">
                <span>Total</span>
                <span>₹{fmt(quotation.totalAmount)}</span>
              </div>
            </div>
          </div>

          {quotation.notes && (
            <div className="border-t border-slate-100 px-6 py-4">
              <p className="font-semibold">Notes</p>
              <p className="whitespace-pre-wrap">{quotation.notes}</p>
            </div>
          )}

          {settings.invoiceTerms && (
            <div className="border-t border-slate-100 px-6 py-4">
              <p className="font-semibold">Terms & Conditions</p>
              <p className="whitespace-pre-wrap">{settings.invoiceTerms}</p>
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-[9px] text-gray-500 print:text-[7px]">Generated with {APP_NAME}</p>
    </main>
  )
}
