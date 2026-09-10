import { Phone, Mail, MapPin } from "lucide-react"

import { amountInWords } from "@/lib/number-to-words"
import { formatShortDate } from "@/lib/utils"
import { documentHeading, COMPOSITION_DISCLAIMER } from "@/lib/gst"
import type { Invoice } from "@/lib/actions/invoice-actions"
import type { BusinessSettings } from "@/lib/actions/settings-actions"
import { APP_NAME } from "@/lib/constants/app"

type InvoicePrintClassicProps = {
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

/**
 * Quantity/unit/price-per-unit for one print row. A diamond line prices per
 * carat, a weighed metal line prices per gram, and anything else (a flat
 * service/certification charge with no weight, e.g. a hallmarking or HUID
 * fee) prices per piece off Invoice.quantity — the same three cases
 * lib/gst.ts's computeGst callers already distinguish, just for display
 * instead of tax math.
 */
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

/** GST amount + effective rate for one line, derived from what's already
 * persisted (lineTotal already includes tax) rather than re-deriving the
 * invoice's single gstRate — works the same whether the line is intra-state
 * (split sgst+cgst) or inter-state (igst only), since the combined amount is
 * identical either way. */
function lineGst(item: Invoice["items"][number]) {
  const amount = item.sgstAmount + item.cgstAmount + item.igstAmount
  const taxable = item.lineTotal - amount
  const percent = taxable > 0 ? Math.round((amount / taxable) * 10000) / 100 : 0
  return { amount, percent }
}

/**
 * The original A4 invoice design (the only one that existed before
 * BusinessSettings.invoiceTemplate was introduced) — a violet contact bar,
 * a dark curved-corner identity block, a violet-header items table, and a
 * boxed totals summary. Extracted verbatim out of the print page's own JSX
 * (pixel-identical, not a redesign) so it can sit alongside the three newer
 * templates (Modern/Minimal/Elegant) as one of four the print page picks
 * between on BusinessSettings.invoiceTemplate.
 */
export function InvoicePrintClassic({ invoice, settings }: InvoicePrintClassicProps) {
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

  // One row per distinct GST rate found across the invoice's lines, split
  // into SGST+CGST (intra-state) or shown as IGST (inter-state) — matches
  // how a real GST tax invoice groups its rate-wise summary, rather than
  // dumping every line's tax into one undifferentiated total.
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

  // The real pre-discount subtotal — invoice.totalAmount already has the
  // discount subtracted out, so totalAmount - taxAmount alone would show a
  // "Sub Total" that's silently net-of-discount with no discount line
  // anywhere to explain the difference.
  const subtotal = invoice.subtotal + invoice.makingCharges + invoice.stoneCharges

  return (
    <main className="mx-auto max-w-3xl space-y-4 bg-white p-6 text-[13px] text-slate-900 print:max-w-none print:w-full print:p-0 print:text-[10px]">
      {/* Without this, Chrome/Edge/Firefox all default the print dialog's
          own "Background graphics" toggle to OFF, silently dropping every
          background color on this page (the violet header, table header,
          Total rows) unless the user finds and checks that box themselves —
          forcing it here makes the print match what's on screen by default. */}
      <style>
        {`@page { size: A4 portrait; margin: 10mm; }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }`}
      </style>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl print:rounded-none print:border-slate-400 print:shadow-none">
        {/* Contact bar — a light violet strip with a dark "address" pill
            floating on its right edge, matching the reference layout. */}
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
            plain white to its right. The decorative violet disc sits fully
            inside this band's own box (no negative offset reaching up into
            the contact bar above) — an earlier version poked up into that
            bar and silently painted over the address text sitting there,
            since it's later in DOM order and stacks on top. It's also only
            shown when there's no logo — once a real logo fills this space,
            the abstract accent has nothing left to usefully occupy and
            would just risk sitting behind/against it. */}
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
                // Self-aligned to the bottom (not vertically centered) and
                // pulled in from the right, clear of the band's curved
                // top-right corner so overflow-hidden never clips it.
                className="relative mr-6 h-14 w-14 shrink-0 self-end rounded-full object-cover ring-2 ring-white/30"
              />
            )}
          </div>
          <div className="flex flex-1 items-center justify-end px-5 py-4 text-right">
            <div>
              <p className="font-serif text-2xl font-bold text-slate-900">{heading}</p>
              {settings.gstScheme === "COMPOSITION" && (
                <p className="max-w-[220px] text-[10px] italic text-slate-600">{COMPOSITION_DISCLAIMER}</p>
              )}
            </div>
          </div>
        </div>

        {/* Bill To / invoice meta */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-300 p-4">
          <div className="space-y-0.5">
            <p className="font-semibold text-violet-600">Bill To:</p>
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

        {/* Line items. Every th/td below overrides globals.css's site-wide
            `table thead th` rule (small-caps, muted-gray, tracked) — that
            rule sets `color` directly on every `th`, which always wins over
            an inherited color from a parent's `text-white` class, so it has
            to be beaten explicitly or the header reads as barely-visible
            gray-on-violet. */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-violet-400 [&>th]:border [&>th]:border-white/30 [&>th]:p-2 [&>th]:text-left [&>th]:align-middle [&>th]:text-[11px] [&>th]:font-semibold [&>th]:normal-case [&>th]:tracking-normal [&>th]:whitespace-normal [&>th]:text-white">
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
                  className="[&>td]:border [&>td]:border-slate-300 [&>td]:p-2 align-top odd:bg-white even:bg-slate-50"
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
            <tr className="bg-violet-400 font-semibold text-white [&>td]:border [&>td]:border-white/30 [&>td]:p-2">
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
              <p className="font-medium text-violet-600">Invoice Amount In Words</p>
              <p>{amountInWords(invoice.totalAmount)}</p>
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
            {invoice.discount > 0 && (
              <div className="flex justify-between border-b border-slate-300 p-1.5">
                <span>Discount</span>
                <span>-₹{fmt(invoice.discount)}</span>
              </div>
            )}
            {sortedRateGroups.map((group) =>
              isInterState ? (
                <div key={group.percent} className="flex justify-between border-b border-slate-300 p-1.5">
                  <span>IGST@{group.percent}%</span>
                  <span>₹{fmt(group.igst)}</span>
                </div>
              ) : (
                <div key={group.percent} className="flex flex-col border-b border-slate-300">
                  <div className="flex justify-between p-1.5">
                    <span>SGST@{(group.percent / 2).toFixed(2)}%</span>
                    <span>₹{fmt(group.sgst)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-300 p-1.5">
                    <span>CGST@{(group.percent / 2).toFixed(2)}%</span>
                    <span>₹{fmt(group.cgst)}</span>
                  </div>
                </div>
              ),
            )}
            {invoice.roundOffAmount !== 0 && (
              <div className="flex justify-between border-b border-slate-300 p-1.5">
                <span>Round Off</span>
                <span>
                  {invoice.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(invoice.roundOffAmount))}
                </span>
              </div>
            )}
            <div className="flex justify-between bg-violet-400 p-1.5 font-semibold text-white">
              <span>Total</span>
              <span>₹{fmt(invoice.totalAmount)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-300 p-1.5">
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
          <div className="border-t-2 border-slate-300 p-4">
            <p className="font-semibold">E-way Bill</p>
            <div className="grid grid-cols-3 gap-x-4">
              {invoice.ewayBillNumber && <span>E-way Bill No: {invoice.ewayBillNumber}</span>}
              {invoice.ewayBillDate && (
                <span>Date: {formatShortDate(invoice.ewayBillDate)}</span>
              )}
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
          <div className="border-t-2 border-slate-300 p-4">
            <p className="font-semibold">Notes</p>
            <p className="whitespace-pre-wrap">{invoice.notes}</p>
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
