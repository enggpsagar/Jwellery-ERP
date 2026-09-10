import type { CSSProperties } from "react"

import { amountInWords } from "@/lib/number-to-words"
import { formatShortDate } from "@/lib/utils"
import { documentHeading, COMPOSITION_DISCLAIMER } from "@/lib/gst"
import type { Invoice } from "@/lib/actions/invoice-actions"
import type { BusinessSettings } from "@/lib/actions/settings-actions"
import { APP_NAME } from "@/lib/constants/app"

type InvoicePrintElegantProps = {
  invoice: Invoice
  settings: BusinessSettings
}

function fmt(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(value: string) {
  return formatShortDate(value)
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PARTIAL: "Partially Paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
}

const TRANSPORT_MODE_LABELS: Record<string, string> = {
  ROAD: "Road",
  RAIL: "Rail",
  AIR: "Air",
  SHIP: "Ship",
}

/** Same per-line qty/unit/price resolution as the other three templates —
 * duplicated rather than shared, matching this codebase's convention of a
 * small pure per-file helper over a shared import for print-page logic. */
function lineQuantity(item: Invoice["items"][number]) {
  if (item.purity === "DIAMOND" && item.caratWeight) {
    return { qty: Number(item.caratWeight), unit: "Ct", pricePerUnit: Number(item.rate ?? 0), isWeighed: true }
  }
  if (item.netWeight && Number(item.netWeight) > 0) {
    return { qty: Number(item.netWeight), unit: "Gm", pricePerUnit: Number(item.rate ?? 0), isWeighed: true }
  }
  const qty = item.quantity || 1
  return { qty, unit: "Pcs", pricePerUnit: Number(item.rate ?? (item.lineTotal / qty)), isWeighed: false }
}

/** Same GST-amount/effective-rate derivation as the other three templates —
 * see InvoicePrintClassic's own copy of this helper for why it's derived
 * from the persisted line amounts rather than the invoice's single
 * gstRate. */
function lineGst(item: Invoice["items"][number]) {
  const amount = item.sgstAmount + item.cgstAmount + item.igstAmount
  const taxable = item.lineTotal - amount
  const percent = taxable > 0 ? Math.round((amount / taxable) * 10000) / 100 : 0
  return { amount, percent }
}

/** Tailwind's `bg-clip-text`/`text-transparent` utilities describe the same
 * `background-clip: text` behaviour, but in a print/PDF rendering path
 * (headless-Chrome print-to-PDF, or any print-CSS engine that trims
 * "unused-looking" declarations) a class-only gradient-text effect has been
 * seen to silently fall back to solid text. Setting both the standard and
 * `-webkit-` prefixed properties inline guarantees the clip actually applies
 * regardless of how the page's stylesheet is loaded at print time — the
 * Tailwind classes below are kept too so the *gradient* (the color stops)
 * still comes from the design system, only the clip mechanics are inlined. */
const GOLD_TEXT_STYLE: CSSProperties = {
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
}
const GOLD_TEXT_CLASSES = "bg-gradient-to-r from-amber-700 via-amber-500 to-amber-700 bg-clip-text text-transparent"

type Corner = "tl" | "tr" | "bl" | "br"

const CORNER_BRACKET_POSITION: Record<Corner, string> = {
  tl: "left-2 top-2 border-l-2 border-t-2",
  tr: "right-2 top-2 border-r-2 border-t-2",
  bl: "left-2 bottom-2 border-l-2 border-b-2",
  br: "right-2 bottom-2 border-r-2 border-b-2",
}

const CORNER_ACCENT_POSITION: Record<Corner, string> = {
  tl: "left-[18px] top-[18px] rotate-45",
  tr: "right-[18px] top-[18px] -rotate-45",
  bl: "left-[18px] bottom-[18px] -rotate-45",
  br: "right-[18px] bottom-[18px] rotate-45",
}

/** One ornamental corner: an amber L-shaped bracket plus a tiny diagonal
 * accent tick just inside it — the same "registration mark" idea as
 * Minimal's plain corner ticks, but in gold and slightly larger/more
 * ornate, matching this template's boutique/invitation-card brief. */
function CornerFlourish({ corner }: { corner: Corner }) {
  return (
    <>
      <div className={`pointer-events-none absolute h-5 w-5 border-amber-400 ${CORNER_BRACKET_POSITION[corner]}`} />
      <div className={`pointer-events-none absolute h-px w-2 bg-amber-400 ${CORNER_ACCENT_POSITION[corner]}`} />
    </>
  )
}

/** The section-divider ornament used throughout this template in place of a
 * plain full-width `<hr>`-style rule: a short amber line, a small rotated
 * diamond, and another short amber line, centered — an invitation-card
 * device rather than a structural table/ledger rule. */
function SectionOrnament() {
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="h-px w-16 bg-amber-300" />
      <div className="h-1 w-1 rotate-45 bg-amber-400" />
      <div className="h-px w-16 bg-amber-300" />
    </div>
  )
}

/**
 * "Elegant" A4 invoice — one of four templates a store picks in Settings
 * (see BusinessSettings.invoiceTemplate). A genuine boutique/luxury
 * jewellery-store print piece: the business name and document heading
 * render as gold gradient text (font-serif, wide tracking), the printable
 * card sits inside a double-line gold border frame with ornamental corner
 * flourishes, section breaks use a small centered line-diamond-line ornament
 * instead of a full-width rule, and the totals box sits on a warm ivory
 * tint rather than plain white — restraint (gold as a highlight, never a
 * flat fill) is still the theme, just carried through with more structural
 * craft than a single thin rule.
 */
export function InvoicePrintElegant({ invoice, settings }: InvoicePrintElegantProps) {
  const businessAddressLines = [
    settings.address,
    [settings.city, settings.state].filter(Boolean).join(", "),
  ].filter(Boolean)

  const customerAddressLines = [
    invoice.customer?.addressLine1,
    invoice.customer?.addressLine2,
    [invoice.customer?.city, invoice.customer?.state].filter(Boolean).join(", "),
    invoice.customer?.pincode,
  ].filter(Boolean)

  const heading = documentHeading(settings.gstScheme)
  const hasBankDetails = Boolean(settings.bankName)

  const rateGroups = new Map<number, { percent: number; sgst: number; cgst: number; igst: number }>()
  for (const item of invoice.items) {
    const { percent } = lineGst(item)
    if (percent <= 0) continue
    const group = rateGroups.get(percent) ?? { percent, sgst: 0, cgst: 0, igst: 0 }
    group.sgst += item.sgstAmount
    group.cgst += item.cgstAmount
    group.igst += item.igstAmount
    rateGroups.set(percent, group)
  }
  const sortedRateGroups = Array.from(rateGroups.values()).sort((a, b) => a.percent - b.percent)
  const isInterState = invoice.items.some((item) => item.igstAmount > 0)

  const subtotal = invoice.subtotal + invoice.makingCharges + invoice.stoneCharges

  return (
    <main className="mx-auto max-w-3xl space-y-4 bg-white p-6 text-[13px] text-slate-900 print:max-w-none print:w-full print:p-0 print:text-[10px]">
      <style>
        {`@page { size: A4 portrait; margin: 10mm; }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }`}
      </style>

      {/* Double-line gold frame: an outer border-2 and an inner border-1,
          a few px apart, rather than a single rule — the "boutique gift
          box" treatment the brief asks for. */}
      <div className="rounded-xl border-2 border-amber-300 p-1 print:rounded-none">
        <div className="relative overflow-hidden rounded-lg border border-amber-200 bg-white print:rounded-none">
          {settings.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logoUrl}
              alt=""
              aria-hidden="true"
              // `sepia` warms the watermark toward the page's own gold
              // accent instead of sitting as a neutral gray ghost — a
              // nice-to-have per the brief, dropped without breaking
              // anything if the store's logo already reads warm.
              className="pointer-events-none absolute inset-0 m-auto h-[360px] w-[360px] object-contain opacity-[0.14] sepia"
            />
          )}

          <CornerFlourish corner="tl" />
          <CornerFlourish corner="tr" />
          <CornerFlourish corner="bl" />
          <CornerFlourish corner="br" />

          {/* Real content sits in its own stacking layer above the
              watermark — see InvoicePrintModern's identical comment for why
              the watermark needs no z-index of its own but this wrapper
              does. */}
          <div className="relative z-10">
            {/* Centered identity — business name + address centered rather
                than split left/right, like an invitation card's masthead.
                Gold gradient text needs the inline style above; the
                Tailwind classes alone supply the gradient's color stops. */}
            <div className="space-y-1 p-6 text-center">
              <p
                className={`font-serif text-2xl font-bold tracking-wide ${GOLD_TEXT_CLASSES}`}
                style={GOLD_TEXT_STYLE}
              >
                {settings.businessName}
              </p>
              {businessAddressLines.length > 0 && (
                <p className="text-[11px] text-slate-600">{businessAddressLines.join(", ")}</p>
              )}
              <p className="text-[11px] text-slate-600">
                {[settings.phone, settings.email].filter(Boolean).join(" · ")}
              </p>
              <p className="text-[11px] text-slate-600">
                {settings.gstNumber && `GSTIN: ${settings.gstNumber}`}
                {settings.gstNumber && settings.state ? "  ·  " : ""}
                {settings.state && `State: ${settings.stateCode ? `${settings.stateCode}-` : ""}${settings.state}`}
              </p>
            </div>

            <SectionOrnament />

            <div className="space-y-1 p-4 text-center">
              <p
                className={`font-serif text-xl font-bold tracking-wide ${GOLD_TEXT_CLASSES}`}
                style={GOLD_TEXT_STYLE}
              >
                {heading}
              </p>
              {settings.gstScheme === "COMPOSITION" && (
                <p className="mx-auto max-w-md text-[10px] italic text-slate-600">{COMPOSITION_DISCLAIMER}</p>
              )}
            </div>

            <SectionOrnament />

            {/* Bill To / invoice meta */}
            <div className="flex flex-wrap items-start justify-between gap-4 p-4">
              <div className="space-y-0.5">
                <p className="font-semibold text-amber-700">Bill To</p>
                <p className="text-base font-bold">{invoice.customer?.name ?? "-"}</p>
                {customerAddressLines.map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
                {invoice.customer?.phone && <p>Contact No.: {invoice.customer.phone}</p>}
              </div>
              <div className="space-y-0.5 text-right">
                <p>
                  <span className="font-semibold">Invoice No.:</span> {invoice.invoiceNumber}
                </p>
                <p>
                  <span className="font-semibold">Date:</span> {fmtDate(invoice.invoiceDate)}
                </p>
                {invoice.dueDate && (
                  <p>
                    <span className="font-semibold">Due Date:</span> {fmtDate(invoice.dueDate)}
                  </p>
                )}
                {invoice.status !== "PAID" && (
                  <p>
                    <span className="font-semibold">Status:</span> {STATUS_LABELS[invoice.status] ?? invoice.status}
                  </p>
                )}
              </div>
            </div>

            {/* Line items — plain white table, a bottom amber border under
                the header row only (no fill), matching the spec's "thin
                gold rule, not a color band" treatment. */}
            <table className="w-full border-collapse">
              <thead>
                <tr className="[&>th]:border-b-2 [&>th]:border-amber-400 [&>th]:p-2 [&>th]:text-left [&>th]:align-middle [&>th]:text-[11px] [&>th]:font-semibold [&>th]:text-slate-700">
                  <th className="w-6">#</th>
                  <th>Item name</th>
                  <th>HSN/ SAC</th>
                  <th className="text-right">Quantity</th>
                  <th>Unit</th>
                  <th className="text-right">Price/ Unit</th>
                  <th className="text-right">GST</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, index) => {
                  const { qty, unit, pricePerUnit } = lineQuantity(item)
                  const { amount: gstAmount, percent: gstPercent } = lineGst(item)
                  return (
                    <tr key={item.id} className="[&>td]:border-b [&>td]:border-amber-100 [&>td]:p-2 align-top">
                      <td>{index + 1}</td>
                      <td className="font-medium">{item.itemName}</td>
                      <td>{item.hsnCode ?? "-"}</td>
                      <td className="text-right whitespace-nowrap">
                        {unit === "Pcs" ? qty : qty.toFixed(3)}
                      </td>
                      <td>{unit}</td>
                      <td className="text-right whitespace-nowrap">₹{fmt(pricePerUnit)}</td>
                      <td className="text-right whitespace-nowrap">
                        ₹{fmt(gstAmount)} {gstPercent > 0 && `(${gstPercent}%)`}
                      </td>
                      <td className="text-right whitespace-nowrap font-medium">₹{fmt(item.lineTotal)}</td>
                    </tr>
                  )
                })}
                <tr className="border-t-2 border-amber-400 font-semibold [&>td]:p-2">
                  <td colSpan={3} className="text-right">
                    Total
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {invoice.items
                      .map(lineQuantity)
                      .filter((line) => line.isWeighed)
                      .reduce((sum, line) => sum + line.qty, 0)
                      .toFixed(3)}
                  </td>
                  <td />
                  <td />
                  <td className="text-right whitespace-nowrap">
                    ₹{fmt(invoice.items.reduce((sum, item) => sum + lineGst(item).amount, 0))}
                  </td>
                  <td className="text-right whitespace-nowrap">₹{fmt(invoice.totalAmount)}</td>
                </tr>
              </tbody>
            </table>

            {/* Pay To (left) / totals (right) */}
            <div className="grid grid-cols-2 gap-6 p-4">
              <div className="space-y-4">
                {hasBankDetails && (
                  <div>
                    <p className="font-medium text-amber-700">Pay To</p>
                    {settings.bankName && <p>Bank Name : {settings.bankName}</p>}
                    {settings.bankAccountNumber && <p>Bank Account No. : {settings.bankAccountNumber}</p>}
                    {settings.bankIfscCode && <p>Bank IFSC code : {settings.bankIfscCode}</p>}
                    {settings.bankAccountHolderName && (
                      <p>Account holder&apos;s name : {settings.bankAccountHolderName}</p>
                    )}
                  </div>
                )}

                <div>
                  <p className="font-medium text-amber-700">Invoice Amount In Words</p>
                  <p>{amountInWords(invoice.totalAmount)}</p>
                </div>

                <div className="pt-6">
                  <p>For : {settings.businessName}</p>
                  <div className="mt-10 w-40 border-t border-slate-400 pt-1 text-[10px] font-medium">
                    Authorized Signatory
                  </div>
                </div>
              </div>

              {/* Warm ivory tint (not plain white) with a thin amber border
                  — the Total row is bold gradient-gold text sitting on that
                  same tint, not a filled block, keeping gold as a highlight
                  rather than a painted band even at the template's most
                  important figure. */}
              <div className="justify-self-end w-full max-w-[260px] overflow-hidden rounded-md border border-amber-300 bg-amber-50/40">
                <div className="flex justify-between border-b border-amber-200 p-1.5">
                  <span>Sub Total</span>
                  <span>₹{fmt(subtotal)}</span>
                </div>
                {invoice.discount > 0 && (
                  <div className="flex justify-between border-b border-amber-200 p-1.5">
                    <span>Discount</span>
                    <span>-₹{fmt(invoice.discount)}</span>
                  </div>
                )}
                {sortedRateGroups.map((group) =>
                  isInterState ? (
                    <div key={group.percent} className="flex justify-between border-b border-amber-200 p-1.5">
                      <span>IGST@{group.percent}%</span>
                      <span>₹{fmt(group.igst)}</span>
                    </div>
                  ) : (
                    <div key={group.percent} className="flex flex-col border-b border-amber-200">
                      <div className="flex justify-between p-1.5">
                        <span>SGST@{(group.percent / 2).toFixed(2)}%</span>
                        <span>₹{fmt(group.sgst)}</span>
                      </div>
                      <div className="flex justify-between border-t border-amber-100 p-1.5">
                        <span>CGST@{(group.percent / 2).toFixed(2)}%</span>
                        <span>₹{fmt(group.cgst)}</span>
                      </div>
                    </div>
                  ),
                )}
                {invoice.roundOffAmount !== 0 && (
                  <div className="flex justify-between border-b border-amber-200 p-1.5">
                    <span>Round Off</span>
                    <span>
                      {invoice.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(invoice.roundOffAmount))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-b border-amber-200 p-1.5 font-bold">
                  <span className={GOLD_TEXT_CLASSES} style={GOLD_TEXT_STYLE}>
                    Total
                  </span>
                  <span className={GOLD_TEXT_CLASSES} style={GOLD_TEXT_STYLE}>
                    ₹{fmt(invoice.totalAmount)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-amber-200 p-1.5">
                  <span>Received</span>
                  <span>₹{fmt(invoice.paidAmount)}</span>
                </div>
                <div className="flex justify-between p-1.5 font-bold text-red-600">
                  <span>Balance</span>
                  <span>₹{fmt(invoice.balanceAmount)}</span>
                </div>
              </div>
            </div>

            {(invoice.ewayBillNumber ||
              invoice.transporterName ||
              invoice.vehicleNumber ||
              invoice.transportMode ||
              invoice.distanceKm) && (
              <div className="p-4">
                <SectionOrnament />
                <p className="mt-3 font-semibold">E-way Bill</p>
                <div className="grid grid-cols-3 gap-x-4">
                  {invoice.ewayBillNumber && <span>E-way Bill No: {invoice.ewayBillNumber}</span>}
                  {invoice.ewayBillDate && <span>Date: {formatShortDate(invoice.ewayBillDate)}</span>}
                  {invoice.transporterName && <span>Transporter: {invoice.transporterName}</span>}
                  {invoice.vehicleNumber && <span>Vehicle No: {invoice.vehicleNumber}</span>}
                  {invoice.transportMode && (
                    <span>Mode: {TRANSPORT_MODE_LABELS[invoice.transportMode] ?? invoice.transportMode}</span>
                  )}
                  {invoice.distanceKm != null && <span>Distance: {invoice.distanceKm} km</span>}
                </div>
              </div>
            )}

            {invoice.notes && (
              <div className="p-4">
                <SectionOrnament />
                <p className="mt-3 font-semibold">Notes</p>
                <p className="whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}

            {settings.invoiceTerms && (
              <div className="p-4">
                <SectionOrnament />
                <p className="mt-3 font-semibold">Terms & Conditions</p>
                <p className="whitespace-pre-wrap">{settings.invoiceTerms}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-center text-[9px] text-gray-500 print:text-[7px]">Generated with {APP_NAME}</p>
    </main>
  )
}
