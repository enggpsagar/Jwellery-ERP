import { amountInWords } from "@/lib/number-to-words"
import { formatShortDate } from "@/lib/utils"
import { COMPOSITION_DISCLAIMER } from "@/lib/gst"
import type { Quotation } from "@/lib/actions/quotation-actions"
import type { BusinessSettings } from "@/lib/actions/settings-actions"
import { APP_NAME } from "@/lib/constants/app"

type QuotationPrintMinimalProps = {
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
 * The Quotation document's Minimal template — pure black-and-white/
 * grayscale per InvoiceTemplate's own schema doc comment: no color
 * anywhere, thin border-slate-300/400 hairlines only, sections stacked
 * with rules rather than boxed. Items table is plainly bordered with bold
 * (unfilled) header text; totals render as a right-aligned label/value
 * stack with a rule above Total and no surrounding box — ink-saving and
 * safe on any printer.
 */
export function QuotationPrintMinimal({ quotation, settings }: QuotationPrintMinimalProps) {
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

      <div className="space-y-4">
        {/* Business identity — plain text, no color, a hairline beneath. */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-400 pb-3">
          <div className="space-y-0.5">
            <p className="text-2xl font-bold text-slate-900">{settings.businessName}</p>
            {settings.gstNumber && <p className="text-[11px] text-slate-600">GSTIN: {settings.gstNumber}</p>}
            {settings.state && (
              <p className="text-[11px] text-slate-600">
                State: {settings.stateCode ? `${settings.stateCode}-` : ""}
                {settings.state}
              </p>
            )}
            {businessAddressLines.length > 0 && (
              <p className="text-[11px] text-slate-600">{businessAddressLines.join(", ")}</p>
            )}
            {(settings.phone || settings.email) && (
              <p className="text-[11px] text-slate-600">
                {[settings.phone, settings.email].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xl font-bold uppercase tracking-wide text-slate-900">Quotation</p>
            {settings.gstScheme === "COMPOSITION" && (
              <p className="max-w-[220px] text-[10px] italic text-slate-600">{COMPOSITION_DISCLAIMER}</p>
            )}
          </div>
        </div>

        {/* Bill To / quotation meta */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-300 pb-3">
          <div className="space-y-0.5">
            <p className="font-semibold">Bill To</p>
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

        {/* Line items — plainly bordered, bold header text on white. */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="[&>th]:border [&>th]:border-slate-400 [&>th]:p-2 [&>th]:text-left [&>th]:align-middle [&>th]:text-[11px] [&>th]:font-bold [&>th]:normal-case [&>th]:tracking-normal [&>th]:whitespace-normal [&>th]:text-slate-900">
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
                <tr key={item.id} className="[&>td]:border [&>td]:border-slate-300 [&>td]:p-2 align-top">
                  <td>{index + 1}</td>
                  <td className="font-medium">{item.itemName}</td>
                  <td className="text-right whitespace-nowrap">{unit === "Pcs" ? qty : qty.toFixed(3)}</td>
                  <td>{unit}</td>
                  <td className="text-right whitespace-nowrap">₹{fmt(pricePerUnit)}</td>
                  <td className="text-right whitespace-nowrap font-medium">₹{fmt(item.lineTotal)}</td>
                </tr>
              )
            })}
            <tr className="font-bold [&>td]:border [&>td]:border-slate-400 [&>td]:p-2">
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
          <p className="border-b border-slate-300 pb-3 italic">
            This quotation has been converted to Invoice {quotation.convertedTo.invoiceNumber}.
          </p>
        )}

        {/* Pay To (left) / totals (right, unboxed label/value stack) */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            {hasBankDetails && (
              <div>
                <p className="font-semibold">Pay To</p>
                {settings.bankName && <p>Bank Name : {settings.bankName}</p>}
                {settings.bankAccountNumber && <p>Bank Account No. : {settings.bankAccountNumber}</p>}
                {settings.bankIfscCode && <p>Bank IFSC code : {settings.bankIfscCode}</p>}
                {settings.bankAccountHolderName && (
                  <p>Account holder&apos;s name : {settings.bankAccountHolderName}</p>
                )}
              </div>
            )}

            <div>
              <p className="font-semibold">Quotation Amount In Words</p>
              <p>{amountInWords(quotation.totalAmount)}</p>
            </div>

            <div className="pt-6">
              <p>For : {settings.businessName}</p>
              <div className="mt-10 w-40 border-t border-black pt-1 text-[10px] font-medium">
                Authorized Signatory
              </div>
            </div>
          </div>

          <div className="justify-self-end w-full max-w-[260px] space-y-1">
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
            <div className="flex justify-between border-t border-slate-400 pt-1 font-bold">
              <span>Total</span>
              <span>₹{fmt(quotation.totalAmount)}</span>
            </div>
          </div>
        </div>

        {quotation.notes && (
          <div className="border-t border-slate-300 pt-3">
            <p className="font-semibold">Notes</p>
            <p className="whitespace-pre-wrap">{quotation.notes}</p>
          </div>
        )}

        {settings.invoiceTerms && (
          <div className="border-t border-slate-300 pt-3">
            <p className="font-semibold">Terms & Conditions</p>
            <p className="whitespace-pre-wrap">{settings.invoiceTerms}</p>
          </div>
        )}
      </div>

      <p className="text-center text-[9px] text-gray-500 print:text-[7px]">Generated with {APP_NAME}</p>
    </main>
  )
}
