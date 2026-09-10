import { Phone, Mail, MapPin } from "lucide-react"

import { amountInWords } from "@/lib/number-to-words"
import { formatShortDate } from "@/lib/utils"
import { COMPOSITION_DISCLAIMER } from "@/lib/gst"
import type { Quotation } from "@/lib/actions/quotation-actions"
import type { BusinessSettings } from "@/lib/actions/settings-actions"
import { APP_NAME } from "@/lib/constants/app"

type QuotationPrintClassicProps = {
  quotation: Quotation
  settings: BusinessSettings
}

function fmt(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(value: string) {
  return formatShortDate(value)
}

/** Quotation's own status strings (a plain string column, not an enum — see
 * Quotation.status's own schema comment), duplicated from
 * QuotationStatusBadge's own map rather than imported, matching this
 * codebase's per-file helper convention for print pages. */
const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  converted: "Converted",
  expired: "Expired",
}

/**
 * Quantity/unit/price-per-unit for one print row — same three cases as
 * Invoice's own lineQuantity (diamond prices per carat, a weighed metal line
 * prices per gram, anything else prices per piece), duplicated here since
 * QuotationItem has the same shape but no per-line GST fields to also
 * derive.
 */
type QuotationItem = Quotation["items"][number]

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

/** Effective GST rate to label the totals' SGST/CGST/IGST rows with —
 * prefers the snapshotted gstRatePercent (present on any quotation raised
 * after that field existed), falling back to deriving it from the
 * persisted taxAmount against the pre-tax taxable base for an older record
 * that has none. Returns null when there's genuinely no tax to label. */
function effectiveGstPercent(quotation: Quotation) {
  if (quotation.gstRatePercent != null) return quotation.gstRatePercent
  const taxable = quotation.subtotal + quotation.makingCharges + quotation.stoneCharges - quotation.discount
  if (taxable > 0 && quotation.taxAmount > 0) {
    return Math.round((quotation.taxAmount / taxable) * 10000) / 100
  }
  return null
}

/**
 * The Quotation document's Classic template — same visual language as
 * Invoice's own Classic (violet contact bar, dark curved-corner identity
 * block, violet-header items table, boxed totals summary), built fresh here
 * since Quotation has no print page at all before this. Two structural
 * differences from Invoice's Classic: the items table has no per-line GST
 * column (Quotation's tax lives at the document level only — see
 * Quotation.taxAmount's own schema comment), and the totals box has no
 * Received/Balance rows (a quotation is a proposal, never a bill — it
 * carries no payment fields at all).
 */
export function QuotationPrintClassic({ quotation, settings }: QuotationPrintClassicProps) {
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
      {/* Without this, Chrome/Edge/Firefox all default the print dialog's
          own "Background graphics" toggle to OFF, silently dropping every
          background color on this page (the violet header, table header,
          Total row) unless the user finds and checks that box themselves —
          forcing it here makes the print match what's on screen by default. */}
      <style>
        {`@page { size: A4 portrait; margin: 10mm; }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }`}
      </style>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl print:rounded-none print:border-slate-400 print:shadow-none">
        {/* Contact bar — a light violet strip with a dark "address" pill
            floating on its right edge, matching Invoice Classic's layout. */}
        <div className="flex flex-wrap items-center gap-3 bg-violet-400 py-2.5 pl-5 pr-1.5 text-white">
          <div className="flex flex-1 flex-wrap items-center gap-5">
            {settings.phone && (
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/25">
                  <Phone className="h-3 w-3" />
                </span>
                {settings.phone}
              </span>
            )}
            {settings.email && (
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/25">
                  <Mail className="h-3 w-3" />
                </span>
                {settings.email}
              </span>
            )}
          </div>
          {businessAddressLines.length > 0 && (
            <span className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-1.5 text-right text-[11px]">
              <MapPin className="h-3.5 w-3.5 shrink-0" /> {businessAddressLines.join(", ")}
            </span>
          )}
        </div>

        {/* Business identity (navy, curved top-right) + document heading on
            plain white to its right. */}
        <div className="flex items-stretch">
          <div
            className="relative flex w-[58%] items-center gap-3 overflow-hidden bg-slate-900 px-5 py-4 text-white"
            style={{ borderTopRightRadius: "70px" }}
          >
            {!settings.logoUrl && (
              <div className="pointer-events-none absolute -top-4 right-4 h-16 w-16 rounded-full bg-violet-400" />
            )}
            <div className="relative flex-1 space-y-0.5">
              <p className="text-xl font-bold uppercase tracking-wide">{settings.businessName}</p>
              {settings.gstNumber && <p className="text-[11px] text-slate-300">GSTIN: {settings.gstNumber}</p>}
              {settings.state && (
                <p className="text-[11px] text-slate-300">
                  State: {settings.stateCode ? `${settings.stateCode}-` : ""}
                  {settings.state}
                </p>
              )}
            </div>
            {settings.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.logoUrl}
                alt={settings.businessName}
                className="relative mr-6 h-14 w-14 shrink-0 self-end rounded-full object-cover ring-2 ring-white/30"
              />
            )}
          </div>
          <div className="flex flex-1 items-center justify-end px-5 py-4 text-right">
            <div>
              <p className="font-serif text-2xl font-bold text-slate-900">Quotation</p>
              {settings.gstScheme === "COMPOSITION" && (
                <p className="max-w-[220px] text-[10px] italic text-slate-600">{COMPOSITION_DISCLAIMER}</p>
              )}
            </div>
          </div>
        </div>

        {/* Bill To / quotation meta */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-300 p-4">
          <div className="space-y-0.5">
            <p className="font-semibold text-violet-600">Bill To:</p>
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

        {/* Line items — no HSN/GST columns: Quotation has neither a per-line
            HSN field nor per-line tax (see QuotationItem's own schema
            comment), unlike Invoice's items table. */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-violet-400 [&>th]:border [&>th]:border-white/30 [&>th]:p-2 [&>th]:text-left [&>th]:align-middle [&>th]:text-[11px] [&>th]:font-semibold [&>th]:normal-case [&>th]:tracking-normal [&>th]:whitespace-normal [&>th]:text-white">
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
                  className="[&>td]:border [&>td]:border-slate-300 [&>td]:p-2 align-top odd:bg-white even:bg-slate-50"
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
            <tr className="bg-violet-400 font-semibold text-white [&>td]:border [&>td]:border-white/30 [&>td]:p-2">
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
          <div className="border-b-2 border-slate-300 bg-green-50 p-3 text-green-800">
            This quotation has been converted to Invoice {quotation.convertedTo.invoiceNumber}.
          </div>
        )}

        {/* Pay To (left) / totals (right) */}
        <div className="grid grid-cols-2 gap-6 p-4">
          <div className="space-y-4">
            {hasBankDetails && (
              <div>
                <p className="font-medium text-violet-600">Pay To:</p>
                {settings.bankName && <p>Bank Name : {settings.bankName}</p>}
                {settings.bankAccountNumber && <p>Bank Account No. : {settings.bankAccountNumber}</p>}
                {settings.bankIfscCode && <p>Bank IFSC code : {settings.bankIfscCode}</p>}
                {settings.bankAccountHolderName && (
                  <p>Account holder&apos;s name : {settings.bankAccountHolderName}</p>
                )}
              </div>
            )}

            <div>
              <p className="font-medium text-violet-600">Quotation Amount In Words</p>
              <p>{amountInWords(quotation.totalAmount)}</p>
            </div>

            <div className="pt-6">
              <p>For : {settings.businessName}</p>
              <div className="mt-10 w-40 border-t border-black pt-1 text-[10px] font-medium">
                Authorized Signatory
              </div>
            </div>
          </div>

          <div className="justify-self-end w-full max-w-[260px] overflow-hidden rounded-md border-2 border-slate-300">
            <div className="flex justify-between border-b border-slate-300 p-1.5">
              <span>Sub Total</span>
              <span>₹{fmt(subtotal)}</span>
            </div>
            {quotation.discount > 0 && (
              <div className="flex justify-between border-b border-slate-300 p-1.5">
                <span>Discount</span>
                <span>-₹{fmt(quotation.discount)}</span>
              </div>
            )}
            {hasGst &&
              (isInterState ? (
                <div className="flex justify-between border-b border-slate-300 p-1.5">
                  <span>IGST{gstPercent != null ? `@${gstPercent}%` : ""}</span>
                  <span>₹{fmt(quotation.igstAmount)}</span>
                </div>
              ) : (
                <div className="flex flex-col border-b border-slate-300">
                  <div className="flex justify-between p-1.5">
                    <span>SGST{gstPercent != null ? `@${(gstPercent / 2).toFixed(2)}%` : ""}</span>
                    <span>₹{fmt(quotation.sgstAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-300 p-1.5">
                    <span>CGST{gstPercent != null ? `@${(gstPercent / 2).toFixed(2)}%` : ""}</span>
                    <span>₹{fmt(quotation.cgstAmount)}</span>
                  </div>
                </div>
              ))}
            {quotation.roundOffAmount !== 0 && (
              <div className="flex justify-between border-b border-slate-300 p-1.5">
                <span>Round Off</span>
                <span>
                  {quotation.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(quotation.roundOffAmount))}
                </span>
              </div>
            )}
            <div className="flex justify-between bg-violet-400 p-1.5 font-semibold text-white">
              <span>Total</span>
              <span>₹{fmt(quotation.totalAmount)}</span>
            </div>
          </div>
        </div>

        {quotation.notes && (
          <div className="border-t-2 border-slate-300 p-4">
            <p className="font-semibold">Notes</p>
            <p className="whitespace-pre-wrap">{quotation.notes}</p>
          </div>
        )}

        {settings.invoiceTerms && (
          <div className="border-t-2 border-slate-300 p-4">
            <p className="font-semibold">Terms & Conditions</p>
            <p className="whitespace-pre-wrap">{settings.invoiceTerms}</p>
          </div>
        )}

        <div className="h-2 bg-gradient-to-r from-indigo-600 to-slate-900" />
      </div>

      <p className="text-center text-[9px] text-gray-500 print:text-[7px]">Generated with {APP_NAME}</p>
    </main>
  )
}
