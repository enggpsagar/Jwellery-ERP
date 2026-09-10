import { Phone, Mail, MapPin } from "lucide-react"

import { amountInWords } from "@/lib/number-to-words"
import { formatShortDate } from "@/lib/utils"
import { documentHeading, COMPOSITION_DISCLAIMER } from "@/lib/gst"
import type { Invoice } from "@/lib/actions/invoice-actions"
import type { BusinessSettings } from "@/lib/actions/settings-actions"
import { APP_NAME } from "@/lib/constants/app"

type InvoicePrintModernProps = {
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

/** Status pill fill on the gradient header band — green reads as settled,
 * amber as "still open" (draft or part-paid), red as void. Text/bg pairs
 * (not just a text color) so the pill stays legible sitting on top of the
 * indigo gradient rather than blending into it. */
const STATUS_PILL_CLASSES: Record<string, string> = {
  PAID: "bg-emerald-500 text-white",
  PARTIAL: "bg-amber-400 text-amber-950",
  DRAFT: "bg-amber-400 text-amber-950",
  CANCELLED: "bg-red-500 text-white",
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

/**
 * "Modern" A4 invoice — one of four templates a store picks in Settings
 * (see BusinessSettings.invoiceTemplate). A premium SaaS-billing look
 * (Stripe/Linear-style): a full indigo gradient header band (business
 * identity on the left, document heading + a status pill on the right)
 * instead of a thin accent rule, a rounded items table with a real indigo-50
 * header fill and alternating body rows, and a totals card whose Total row
 * repeats the header's gradient so the final figure reads with the same
 * weight as the masthead. The header band's own `-webkit-print-color-adjust`
 * comes from the shared `<style>` block below — without it, browsers print
 * this gradient (and the Total row's) as plain white by default.
 */
export function InvoicePrintModern({ invoice, settings }: InvoicePrintModernProps) {
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
  const statusPillClass = STATUS_PILL_CLASSES[invoice.status] ?? "bg-white/25 text-white"

  return (
    <main className="mx-auto max-w-3xl space-y-4 bg-white p-6 text-[13px] text-slate-900 print:max-w-none print:w-full print:p-0 print:text-[10px]">
      <style>
        {`@page { size: A4 portrait; margin: 10mm; }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }`}
      </style>

      {/* `relative` so the logo watermark below can be pinned with
          `absolute inset-0` against this card specifically, not the
          viewport — and `overflow-hidden` (needed anyway for the rounded
          corners) doubles as the clip that keeps an oversized watermark
          from spilling past the card edge. */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg print:rounded-none print:border-slate-400 print:shadow-none">
        {settings.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={settings.logoUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 m-auto h-[360px] w-[360px] object-contain opacity-[0.14]"
          />
        )}

        {/* Real content sits in its own stacking layer above the watermark.
            The watermark img is `absolute` with no z-index (stack level 0),
            so without this explicit positive z-index the in-flow content
            below would still paint UNDER it per normal CSS paint order —
            positioned elements paint after non-positioned flow content by
            default. */}
        <div className="relative z-10">
          {/* Gradient identity + heading band — business name/contact on the
              left, document heading + a status pill (color keyed off
              invoice.status) on the right, both on one indigo gradient
              instead of a plain white block with a thin accent rule. */}
          <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-indigo-600 to-indigo-400 px-6 py-5 text-white">
            <div className="space-y-1.5">
              <p className="text-2xl font-bold">{settings.businessName}</p>
              {settings.gstNumber && <p className="text-[11px] text-indigo-100">GSTIN: {settings.gstNumber}</p>}
              {settings.state && (
                <p className="text-[11px] text-indigo-100">
                  State: {settings.stateCode ? `${settings.stateCode}-` : ""}
                  {settings.state}
                </p>
              )}
              {businessAddressLines.length > 0 && (
                <p className="flex items-center gap-1.5 text-[11px] text-indigo-100">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {businessAddressLines.join(", ")}
                </p>
              )}
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-indigo-100">
                {settings.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 shrink-0" />
                    {settings.phone}
                  </span>
                )}
                {settings.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3 w-3 shrink-0" />
                    {settings.email}
                  </span>
                )}
              </p>
            </div>
            <div className="space-y-2 text-right">
              <p className="text-2xl font-bold">{heading}</p>
              <span
                className={`inline-block rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusPillClass}`}
              >
                {STATUS_LABELS[invoice.status] ?? invoice.status}
              </span>
              {settings.gstScheme === "COMPOSITION" && (
                <p className="max-w-[220px] text-[10px] italic text-indigo-100">{COMPOSITION_DISCLAIMER}</p>
              )}
            </div>
          </div>

          {/* Bill To / invoice meta */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 p-5">
            <div className="space-y-0.5">
              <p className="font-semibold text-indigo-600">Bill To</p>
              <p className="text-base font-bold">{invoice.customer?.name ?? "-"}</p>
              {customerAddressLines.map((line, index) => (
                <p key={index} className="text-slate-600">
                  {line}
                </p>
              ))}
              {invoice.customer?.phone && (
                <p className="flex items-center gap-1.5 text-slate-600">
                  <Phone className="h-3 w-3 shrink-0" />
                  Contact No.: {invoice.customer.phone}
                </p>
              )}
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

          {/* Line items — a real indigo-50 header fill (not a bare rule) and
              alternating indigo-50/white body rows, wrapped in its own
              rounded card so the header fill gets rounded top corners
              instead of running edge-to-edge into the outer card's border. */}
          <div className="mx-5 my-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-indigo-50 [&>th]:px-2.5 [&>th]:py-2.5 [&>th]:text-left [&>th]:align-middle [&>th]:text-[11px] [&>th]:font-semibold [&>th]:text-indigo-700">
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
                    <tr
                      key={item.id}
                      className="[&>td]:px-2.5 [&>td]:py-2.5 align-top odd:bg-white even:bg-indigo-50/40"
                    >
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
                <tr className="border-t-2 border-indigo-200 bg-indigo-50/60 font-semibold [&>td]:px-2.5 [&>td]:py-2.5">
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
          </div>

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
                <p className="font-medium text-indigo-600">Invoice Amount In Words</p>
                <p>{amountInWords(invoice.totalAmount)}</p>
              </div>

              <div className="pt-6">
                <p>For : {settings.businessName}</p>
                <div className="mt-10 w-40 border-t border-slate-400 pt-1 text-[10px] font-medium">
                  Authorized Signatory
                </div>
              </div>
            </div>

            {/* Rounded totals card — every row shares the same soft border,
                and only the Total row repeats the header's gradient fill
                (white bold text) so it reads with the same visual weight
                as the masthead above, instead of a flat indigo-50 tint. */}
            <div className="justify-self-end w-full max-w-[260px] overflow-hidden rounded-lg border border-slate-200">
              <div className="flex justify-between border-b border-slate-200 p-2">
                <span>Sub Total</span>
                <span>₹{fmt(subtotal)}</span>
              </div>
              {invoice.discount > 0 && (
                <div className="flex justify-between border-b border-slate-200 p-2">
                  <span>Discount</span>
                  <span>-₹{fmt(invoice.discount)}</span>
                </div>
              )}
              {sortedRateGroups.map((group) =>
                isInterState ? (
                  <div key={group.percent} className="flex justify-between border-b border-slate-200 p-2">
                    <span>IGST@{group.percent}%</span>
                    <span>₹{fmt(group.igst)}</span>
                  </div>
                ) : (
                  <div key={group.percent} className="flex flex-col border-b border-slate-200">
                    <div className="flex justify-between p-2">
                      <span>SGST@{(group.percent / 2).toFixed(2)}%</span>
                      <span>₹{fmt(group.sgst)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-100 p-2">
                      <span>CGST@{(group.percent / 2).toFixed(2)}%</span>
                      <span>₹{fmt(group.cgst)}</span>
                    </div>
                  </div>
                ),
              )}
              {invoice.roundOffAmount !== 0 && (
                <div className="flex justify-between border-b border-slate-200 p-2">
                  <span>Round Off</span>
                  <span>
                    {invoice.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(invoice.roundOffAmount))}
                  </span>
                </div>
              )}
              <div className="flex justify-between bg-gradient-to-r from-indigo-600 to-indigo-400 p-2 font-bold text-white">
                <span>Total</span>
                <span>₹{fmt(invoice.totalAmount)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 p-2">
                <span>Received</span>
                <span>₹{fmt(invoice.paidAmount)}</span>
              </div>
              <div className="flex justify-between p-2 font-bold text-red-600">
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
            <div className="border-t border-slate-200 p-5">
              <p className="font-semibold">E-way Bill</p>
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
            <div className="border-t border-slate-200 p-5">
              <p className="font-semibold">Notes</p>
              <p className="whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          {settings.invoiceTerms && (
            <div className="border-t border-slate-200 p-5">
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
