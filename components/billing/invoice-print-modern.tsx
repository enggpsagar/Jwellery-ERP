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
 * (see BusinessSettings.invoiceTemplate). Styled after a modern SaaS
 * invoice (Stripe/QuickBooks): light and airy, no color bands or curved
 * shapes, an indigo accent used sparingly (a thin rule under the header and
 * the Total row's background) rather than painted across the page like
 * Classic's violet bars.
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

  return (
    <main className="mx-auto max-w-3xl space-y-4 bg-white p-6 text-[13px] text-slate-900 print:max-w-none print:w-full print:p-0 print:text-[10px]">
      <style>
        {`@page { size: A4 portrait; margin: 10mm; }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }`}
      </style>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white print:rounded-none print:border-slate-400">
        {/* Plain identity header — no dark block, no color band. Business
            name in bold with GSTIN/state as small gray text underneath, a
            thin indigo rule beneath the whole section is the template's
            only accent besides the Total row. */}
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="space-y-1">
            <p className="text-xl font-bold text-slate-900">{settings.businessName}</p>
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
            <p className="text-[11px] text-slate-500">
              {[settings.phone, settings.email].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">{heading}</p>
            {settings.gstScheme === "COMPOSITION" && (
              <p className="max-w-[220px] text-[10px] italic text-slate-500">{COMPOSITION_DISCLAIMER}</p>
            )}
          </div>
        </div>
        <div className="h-[3px] bg-indigo-500" />

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
            {invoice.customer?.phone && <p className="text-slate-600">Contact No.: {invoice.customer.phone}</p>}
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

        {/* Line items — alternating white/slate-50 rows, only a thin bottom
            border under the header (no fill), matching the "light SaaS
            invoice" feel rather than Classic's colored header band. */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="[&>th]:border-b-2 [&>th]:border-slate-200 [&>th]:p-2 [&>th]:text-left [&>th]:align-middle [&>th]:text-[11px] [&>th]:font-semibold [&>th]:text-slate-500">
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
                <tr key={item.id} className="[&>td]:p-2 align-top odd:bg-white even:bg-slate-50">
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
            <tr className="border-t-2 border-slate-200 font-semibold [&>td]:p-2">
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

          {/* Plain gray-bordered box — only the final Total row gets the
              light indigo fill, everything else stays white. */}
          <div className="justify-self-end w-full max-w-[260px] overflow-hidden rounded-md border border-slate-200">
            <div className="flex justify-between border-b border-slate-200 p-1.5">
              <span>Sub Total</span>
              <span>₹{fmt(subtotal)}</span>
            </div>
            {invoice.discount > 0 && (
              <div className="flex justify-between border-b border-slate-200 p-1.5">
                <span>Discount</span>
                <span>-₹{fmt(invoice.discount)}</span>
              </div>
            )}
            {sortedRateGroups.map((group) =>
              isInterState ? (
                <div key={group.percent} className="flex justify-between border-b border-slate-200 p-1.5">
                  <span>IGST@{group.percent}%</span>
                  <span>₹{fmt(group.igst)}</span>
                </div>
              ) : (
                <div key={group.percent} className="flex flex-col border-b border-slate-200">
                  <div className="flex justify-between p-1.5">
                    <span>SGST@{(group.percent / 2).toFixed(2)}%</span>
                    <span>₹{fmt(group.sgst)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 p-1.5">
                    <span>CGST@{(group.percent / 2).toFixed(2)}%</span>
                    <span>₹{fmt(group.cgst)}</span>
                  </div>
                </div>
              ),
            )}
            {invoice.roundOffAmount !== 0 && (
              <div className="flex justify-between border-b border-slate-200 p-1.5">
                <span>Round Off</span>
                <span>
                  {invoice.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(invoice.roundOffAmount))}
                </span>
              </div>
            )}
            <div className="flex justify-between bg-indigo-50 p-1.5 font-semibold text-indigo-700">
              <span>Total</span>
              <span>₹{fmt(invoice.totalAmount)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 p-1.5">
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

      <p className="text-center text-[9px] text-gray-500 print:text-[7px]">Generated with {APP_NAME}</p>
    </main>
  )
}
