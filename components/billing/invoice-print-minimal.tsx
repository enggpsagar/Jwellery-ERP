import type { ReactNode } from "react"

import { amountInWords } from "@/lib/number-to-words"
import { formatShortDate } from "@/lib/utils"
import { documentHeading, COMPOSITION_DISCLAIMER } from "@/lib/gst"
import type { Invoice } from "@/lib/actions/invoice-actions"
import type { BusinessSettings } from "@/lib/actions/settings-actions"
import { APP_NAME } from "@/lib/constants/app"

type InvoicePrintMinimalProps = {
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

/** A small-caps, wide-tracked section label — the editorial-print device
 * used in place of a plain bold "Bill To"/"Notes" line throughout this
 * template, so structure reads through typography alone rather than color
 * or fill (this template stays strictly black-and-white). */
function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">{children}</p>
}

/** The heavy-over-thin double rule — one `border-t-2` line directly above a
 * `border-t` hairline, a couple of pixels apart. Used once under the main
 * heading (this file) and reused (smaller) above the Total row: a classic
 * editorial-print device that reads as "considered" rather than a single
 * flat rule. */
function DoubleRule({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <div className="border-t-2 border-slate-900" />
      <div className="mt-[2px] border-t border-slate-300" />
    </div>
  )
}

/**
 * "Minimal" A4 invoice — one of four templates a store picks in Settings
 * (see BusinessSettings.invoiceTemplate). Deliberately, expensively minimal
 * rather than plain: strictly grayscale (no color anywhere, not even a tint,
 * so it stays legible on a cheap monochrome printer with no background
 * graphics), but with real typographic sophistication — tracked small-caps
 * section labels, an editorial double-rule under the heading and above the
 * Total, generous vertical whitespace between sections instead of tight
 * hairline-separated blocks, and four corner "registration marks" (a
 * print-industry device signalling a deliberately designed sheet) framing
 * the printable card.
 */
export function InvoicePrintMinimal({ invoice, settings }: InvoicePrintMinimalProps) {
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

      {/* `relative` anchors both the four corner registration marks and the
          logo watermark to this card specifically. There's no visible
          border here — the ticks alone imply the sheet's edge, which is the
          point of the device (a boxed border would just be Classic again). */}
      <div className="relative p-7">
        <div className="pointer-events-none absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-slate-900" />
        <div className="pointer-events-none absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-slate-900" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-slate-900" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-slate-900" />

        {settings.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={settings.logoUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 m-auto h-[340px] w-[340px] object-contain opacity-[0.09] grayscale"
          />
        )}

        {/* Real content sits in its own stacking layer above the watermark
            — see InvoicePrintModern's identical comment for why the
            watermark needs no z-index of its own but this wrapper does. */}
        <div className="relative z-10 space-y-8">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4">
              <div className="space-y-0.5">
                <p className="text-xl font-bold text-slate-900">{settings.businessName}</p>
                {settings.gstNumber && <p className="text-[11px] text-slate-700">GSTIN: {settings.gstNumber}</p>}
                {settings.state && (
                  <p className="text-[11px] text-slate-700">
                    State: {settings.stateCode ? `${settings.stateCode}-` : ""}
                    {settings.state}
                  </p>
                )}
                {businessAddressLines.length > 0 && (
                  <p className="text-[11px] text-slate-700">{businessAddressLines.join(", ")}</p>
                )}
                <p className="text-[11px] text-slate-700">
                  {[settings.phone, settings.email].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-900">{heading}</p>
                {settings.gstScheme === "COMPOSITION" && (
                  <p className="max-w-[220px] text-[10px] italic text-slate-700">{COMPOSITION_DISCLAIMER}</p>
                )}
              </div>
            </div>
            <DoubleRule />
          </div>

          {/* Bill To / invoice meta */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <SectionLabel>Bill To</SectionLabel>
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

          {/* Line items — stays a plain bordered table (the one place a grid
              of rules is appropriate: a ledger), but with tighter, more
              considered typography: a heavier dark header rule instead of
              the same gray as every other line, and tabular numerals so the
              qty/price/GST/amount columns actually align digit-for-digit. */}
          <table className="w-full border-collapse border border-slate-400">
            <thead>
              <tr className="[&>th]:border-x [&>th]:border-t [&>th]:border-slate-400 [&>th]:border-b-2 [&>th]:border-b-slate-900 [&>th]:p-2 [&>th]:text-left [&>th]:align-middle [&>th]:text-[11px] [&>th]:font-bold [&>th]:text-slate-900">
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
                  <tr key={item.id} className="[&>td]:border [&>td]:border-slate-400 [&>td]:p-2 align-top">
                    <td className="tabular-nums">{index + 1}</td>
                    <td className="font-medium">{item.itemName}</td>
                    <td>{item.hsnCode ?? "-"}</td>
                    <td className="text-right tabular-nums whitespace-nowrap">
                      {unit === "Pcs" ? qty : qty.toFixed(3)}
                    </td>
                    <td>{unit}</td>
                    <td className="text-right tabular-nums whitespace-nowrap">₹{fmt(pricePerUnit)}</td>
                    <td className="text-right tabular-nums whitespace-nowrap">
                      ₹{fmt(gstAmount)} {gstPercent > 0 && `(${gstPercent}%)`}
                    </td>
                    <td className="text-right tabular-nums whitespace-nowrap font-medium">
                      ₹{fmt(item.lineTotal)}
                    </td>
                  </tr>
                )
              })}
              <tr className="font-bold [&>td]:border [&>td]:border-slate-400 [&>td]:p-2">
                <td colSpan={3} className="text-right">
                  Total
                </td>
                <td className="text-right tabular-nums whitespace-nowrap">
                  {invoice.items
                    .map(lineQuantity)
                    .filter((line) => line.isWeighed)
                    .reduce((sum, line) => sum + line.qty, 0)
                    .toFixed(3)}
                </td>
                <td />
                <td />
                <td className="text-right tabular-nums whitespace-nowrap">
                  ₹{fmt(invoice.items.reduce((sum, item) => sum + lineGst(item).amount, 0))}
                </td>
                <td className="text-right tabular-nums whitespace-nowrap">₹{fmt(invoice.totalAmount)}</td>
              </tr>
            </tbody>
          </table>

          {/* Pay To (left) / totals (right) — totals stay unboxed, but a
              faint slate-50 tint groups the Subtotal-through-Total rows
              visually (still grayscale — a tint band, not a literal box
              border) so the eye can tell "these build to the total" apart
              from Received/Balance underneath. */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              {hasBankDetails && (
                <div className="space-y-1">
                  <SectionLabel>Pay To</SectionLabel>
                  {settings.bankName && <p>Bank Name : {settings.bankName}</p>}
                  {settings.bankAccountNumber && <p>Bank Account No. : {settings.bankAccountNumber}</p>}
                  {settings.bankIfscCode && <p>Bank IFSC code : {settings.bankIfscCode}</p>}
                  {settings.bankAccountHolderName && (
                    <p>Account holder&apos;s name : {settings.bankAccountHolderName}</p>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <SectionLabel>Invoice Amount In Words</SectionLabel>
                <p>{amountInWords(invoice.totalAmount)}</p>
              </div>

              <div className="pt-6">
                <p>For : {settings.businessName}</p>
                <div className="mt-10 w-40 border-t border-black pt-1 text-[10px] font-medium">
                  Authorized Signatory
                </div>
              </div>
            </div>

            <div className="justify-self-end w-full max-w-[260px] space-y-1">
              <div className="-mx-2 space-y-1 bg-slate-50 px-2 py-1.5">
                <div className="flex justify-between">
                  <span>Sub Total</span>
                  <span className="tabular-nums">₹{fmt(subtotal)}</span>
                </div>
                {invoice.discount > 0 && (
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span className="tabular-nums">-₹{fmt(invoice.discount)}</span>
                  </div>
                )}
                {sortedRateGroups.map((group) =>
                  isInterState ? (
                    <div key={group.percent} className="flex justify-between">
                      <span>IGST@{group.percent}%</span>
                      <span className="tabular-nums">₹{fmt(group.igst)}</span>
                    </div>
                  ) : (
                    <div key={group.percent} className="space-y-1">
                      <div className="flex justify-between">
                        <span>SGST@{(group.percent / 2).toFixed(2)}%</span>
                        <span className="tabular-nums">₹{fmt(group.sgst)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>CGST@{(group.percent / 2).toFixed(2)}%</span>
                        <span className="tabular-nums">₹{fmt(group.cgst)}</span>
                      </div>
                    </div>
                  ),
                )}
                {invoice.roundOffAmount !== 0 && (
                  <div className="flex justify-between">
                    <span>Round Off</span>
                    <span className="tabular-nums">
                      {invoice.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(invoice.roundOffAmount))}
                    </span>
                  </div>
                )}
                <DoubleRule className="pt-1" />
                <div className="flex justify-between pt-1 text-base font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">₹{fmt(invoice.totalAmount)}</span>
                </div>
              </div>
              <div className="flex justify-between pt-1">
                <span>Received</span>
                <span className="tabular-nums">₹{fmt(invoice.paidAmount)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Balance</span>
                <span className="tabular-nums">₹{fmt(invoice.balanceAmount)}</span>
              </div>
            </div>
          </div>

          {(invoice.ewayBillNumber ||
            invoice.transporterName ||
            invoice.vehicleNumber ||
            invoice.transportMode ||
            invoice.distanceKm) && (
            <div className="space-y-1">
              <SectionLabel>E-way Bill</SectionLabel>
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
            <div className="space-y-1">
              <SectionLabel>Notes</SectionLabel>
              <p className="whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          {settings.invoiceTerms && (
            <div className="space-y-1">
              <SectionLabel>Terms & Conditions</SectionLabel>
              <p className="whitespace-pre-wrap">{settings.invoiceTerms}</p>
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-[9px] text-slate-600 print:text-[7px]">Generated with {APP_NAME}</p>
    </main>
  )
}
