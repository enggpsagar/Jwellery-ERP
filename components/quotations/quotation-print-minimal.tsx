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

/** Small-caps section label — the wide-tracking uppercase tag that sits
 * above each block of content in this template (Bill To, Pay To, etc.). */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">{children}</p>
}

/** A registration-mark tick — a thin L-shaped border accent pinned to one
 * corner of the printable card. */
function CornerTick({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const placement: Record<string, string> = {
    tl: "left-0 top-0 border-l border-t",
    tr: "right-0 top-0 border-r border-t",
    bl: "left-0 bottom-0 border-l border-b",
    br: "right-0 bottom-0 border-r border-b",
  }
  return <span className={`pointer-events-none absolute h-3 w-3 border-slate-900 ${placement[position]}`} />
}

/**
 * The Quotation document's Minimal template — deliberately, expensively
 * minimal (a Kinfolk/Muji-style print piece) rather than merely plain:
 * strictly grayscale, wide-tracked small-caps section labels, a two-line
 * (thick-over-thin) rule under the main heading and again above the Total,
 * thin corner registration-mark ticks on the printable card, and generous
 * vertical whitespace between sections. Items table stays a plainly
 * bordered grid with tabular-numeral alignment and a heavier rule under
 * the header row; totals stay an unboxed stack inside a faint slate-50
 * tint band. Matches Invoice's own Minimal for visual consistency across
 * the two documents. Same document-level-GST-only / no-payment-rows
 * differences from Invoice's own Minimal as quotation-print-classic.tsx
 * has from Invoice's Classic.
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
    <main className="mx-auto max-w-3xl bg-white p-6 text-[13px] text-slate-900 print:max-w-none print:w-full print:p-0 print:text-[10px]">
      <style>
        {`@page { size: A4 portrait; margin: 10mm; }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }`}
      </style>

      <div className="relative p-3">
        <CornerTick position="tl" />
        <CornerTick position="tr" />
        <CornerTick position="bl" />
        <CornerTick position="br" />

        {settings.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={settings.logoUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 m-auto h-[320px] w-[320px] object-contain opacity-[0.09] grayscale"
          />
        )}

        <div className="relative z-10 space-y-8">
          {/* Business identity — plain text, no color, a two-line rule
              beneath the Quotation heading. */}
          <div className="flex flex-wrap items-start justify-between gap-4 pb-3">
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
              <div className="ml-auto mt-1.5 w-32">
                <div className="h-[2px] bg-slate-900" />
                <div className="mt-[2px] h-px bg-slate-300" />
              </div>
              {settings.gstScheme === "COMPOSITION" && (
                <p className="mt-1.5 max-w-[220px] text-[10px] italic text-slate-600">{COMPOSITION_DISCLAIMER}</p>
              )}
            </div>
          </div>

          {/* Bill To / quotation meta */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-t border-slate-300 pt-4">
            <div className="space-y-0.5">
              <SectionLabel>Bill To</SectionLabel>
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

          {/* Line items — plainly bordered, tabular numerals, a heavier
              rule under the header row. */}
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-b-slate-900 [&>th]:border [&>th]:border-slate-400 [&>th]:p-2 [&>th]:text-left [&>th]:align-middle [&>th]:text-[11px] [&>th]:font-bold [&>th]:normal-case [&>th]:tracking-normal [&>th]:whitespace-normal [&>th]:text-slate-900">
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
                    <td className="tabular-nums">{index + 1}</td>
                    <td className="font-medium">{item.itemName}</td>
                    <td className="text-right tabular-nums whitespace-nowrap">
                      {unit === "Pcs" ? qty : qty.toFixed(3)}
                    </td>
                    <td>{unit}</td>
                    <td className="text-right tabular-nums whitespace-nowrap">₹{fmt(pricePerUnit)}</td>
                    <td className="text-right tabular-nums whitespace-nowrap font-medium">₹{fmt(item.lineTotal)}</td>
                  </tr>
                )
              })}
              <tr className="font-bold [&>td]:border [&>td]:border-slate-400 [&>td]:p-2">
                <td colSpan={2} className="text-right">
                  Total
                </td>
                <td className="text-right tabular-nums whitespace-nowrap">
                  {(quotation.items.map(lineQuantity) as LineQuantity[])
                    .filter((line) => line.isWeighed)
                    .reduce((sum, line) => sum + line.qty, 0)
                    .toFixed(3)}
                </td>
                <td />
                <td />
                <td className="text-right tabular-nums whitespace-nowrap">₹{fmt(quotation.totalAmount)}</td>
              </tr>
            </tbody>
          </table>

          {quotation.convertedToId && quotation.convertedTo && (
            <p className="border-t border-slate-300 pt-3 italic">
              This quotation has been converted to Invoice {quotation.convertedTo.invoiceNumber}.
            </p>
          )}

          {/* Pay To (left) / totals (right, unboxed stack in a faint tint band) */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              {hasBankDetails && (
                <div className="space-y-0.5">
                  <SectionLabel>Pay To</SectionLabel>
                  {settings.bankName && <p>Bank Name : {settings.bankName}</p>}
                  {settings.bankAccountNumber && <p>Bank Account No. : {settings.bankAccountNumber}</p>}
                  {settings.bankIfscCode && <p>Bank IFSC code : {settings.bankIfscCode}</p>}
                  {settings.bankAccountHolderName && (
                    <p>Account holder&apos;s name : {settings.bankAccountHolderName}</p>
                  )}
                </div>
              )}

              <div className="space-y-0.5">
                <SectionLabel>Quotation Amount In Words</SectionLabel>
                <p>{amountInWords(quotation.totalAmount)}</p>
              </div>

              <div className="pt-6">
                <p>For : {settings.businessName}</p>
                <div className="mt-10 w-40 border-t border-black pt-1 text-[10px] font-medium">
                  Authorized Signatory
                </div>
              </div>
            </div>

            <div className="justify-self-end w-full max-w-[260px]">
              <div className="space-y-1 bg-slate-50 p-3">
                <div className="flex justify-between">
                  <span>Sub Total</span>
                  <span className="tabular-nums">₹{fmt(subtotal)}</span>
                </div>
                {quotation.discount > 0 && (
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span className="tabular-nums">-₹{fmt(quotation.discount)}</span>
                  </div>
                )}
                {hasGst &&
                  (isInterState ? (
                    <div className="flex justify-between">
                      <span>IGST{gstPercent != null ? `@${gstPercent}%` : ""}</span>
                      <span className="tabular-nums">₹{fmt(quotation.igstAmount)}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span>SGST{gstPercent != null ? `@${(gstPercent / 2).toFixed(2)}%` : ""}</span>
                        <span className="tabular-nums">₹{fmt(quotation.sgstAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>CGST{gstPercent != null ? `@${(gstPercent / 2).toFixed(2)}%` : ""}</span>
                        <span className="tabular-nums">₹{fmt(quotation.cgstAmount)}</span>
                      </div>
                    </>
                  ))}
                {quotation.roundOffAmount !== 0 && (
                  <div className="flex justify-between">
                    <span>Round Off</span>
                    <span className="tabular-nums">
                      {quotation.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(quotation.roundOffAmount))}
                    </span>
                  </div>
                )}
                <div className="pt-2">
                  <div className="h-[2px] bg-slate-900" />
                  <div className="mt-[2px] h-px bg-slate-300" />
                </div>
                <div className="flex justify-between pt-1 text-base font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">₹{fmt(quotation.totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          {quotation.notes && (
            <div className="space-y-0.5 border-t border-slate-300 pt-3">
              <SectionLabel>Notes</SectionLabel>
              <p className="whitespace-pre-wrap">{quotation.notes}</p>
            </div>
          )}

          {settings.invoiceTerms && (
            <div className="space-y-0.5 border-t border-slate-300 pt-3">
              <SectionLabel>Terms & Conditions</SectionLabel>
              <p className="whitespace-pre-wrap">{settings.invoiceTerms}</p>
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-[9px] text-gray-500 print:text-[7px]">Generated with {APP_NAME}</p>
    </main>
  )
}
