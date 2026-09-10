import Link from "next/link"

import { amountInWords } from "@/lib/number-to-words"
import { formatShortDate } from "@/lib/utils"
import type { KachaInvoice } from "@/lib/actions/kacha-invoice-actions"
import type { BusinessSettings } from "@/lib/actions/settings-actions"

type KachaPrintElegantProps = {
  kachaInvoice: KachaInvoice
  settings: BusinessSettings
}

function fmt(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Same per-line qty/unit resolution as KachaPrintClassic's own — duplicated
 * per file rather than shared, matching this codebase's convention. */
function lineQuantity(item: KachaInvoice["items"][number]) {
  if (item.purity === "DIAMOND" && item.caratWeight) {
    return { qty: item.caratWeight, unit: "Ct" }
  }
  if (item.netWeight && item.netWeight > 0) {
    return { qty: item.netWeight, unit: "Gm" }
  }
  return { qty: item.quantity || 1, unit: "Pcs" }
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PARTIAL: "Partially Paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
}

/**
 * ELEGANT A4 layout for a Kacha Slip — a boutique/premium feel: a gold/amber
 * accent (plain Tailwind amber-600/700, not this app's own --chart-2 brand
 * var), serif headings with generous tracking, a centered header block, and
 * thin amber rules between sections rather than boxes or color fills.
 */
export function KachaPrintElegant({ kachaInvoice, settings }: KachaPrintElegantProps) {
  const businessAddressLines = [
    settings.address,
    [settings.city, settings.state].filter(Boolean).join(", "),
  ].filter(Boolean)

  const hasBankDetails = Boolean(settings.bankName)
  const subtotal = kachaInvoice.subtotal + kachaInvoice.makingCharges + kachaInvoice.stoneCharges

  return (
    <main className="mx-auto max-w-3xl space-y-4 bg-white p-6 text-[13px] text-slate-900 print:max-w-none print:w-full print:p-0 print:text-[10px]">
      <style>
        {`@page { size: A4 portrait; margin: 10mm; }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }`}
      </style>

      <div className="space-y-4 bg-white">
        <div className="space-y-1 border-b border-amber-300 pb-4 text-center">
          {settings.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logoUrl}
              alt={settings.businessName}
              className="mx-auto mb-2 h-14 w-14 rounded-full object-cover"
            />
          )}
          <p className="font-serif text-2xl font-bold tracking-wide text-slate-900">{settings.businessName}</p>
          <div className="text-[11px] text-slate-500">
            {settings.gstNumber && <p>GSTIN: {settings.gstNumber}</p>}
            {settings.state && (
              <p>
                State: {settings.stateCode ? `${settings.stateCode}-` : ""}
                {settings.state}
              </p>
            )}
            {businessAddressLines.length > 0 && <p>{businessAddressLines.join(", ")}</p>}
            {(settings.phone || settings.email) && (
              <p>{[settings.phone, settings.email].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <p className="font-serif text-lg font-semibold tracking-wide text-amber-700">Kacha Slip</p>
          {kachaInvoice.convertedTo && (
            <p className="text-[10px] text-slate-500">
              Converted to Tax Invoice{" "}
              <Link href={`/billing/${kachaInvoice.convertedTo.id}`} className="text-amber-700 underline">
                {kachaInvoice.convertedTo.invoiceNumber}
              </Link>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-amber-200 pb-3">
          <div className="space-y-0.5">
            <p className="font-serif font-semibold tracking-wide text-amber-700">Bill To</p>
            <p className="text-base font-semibold">{kachaInvoice.customer?.name ?? "-"}</p>
            {kachaInvoice.customer?.phone && <p>{kachaInvoice.customer.phone}</p>}
          </div>
          <div className="space-y-0.5 text-right">
            <p>
              <span className="font-semibold">Slip No.:</span> {kachaInvoice.slipNumber}
            </p>
            <p>
              <span className="font-semibold">Date:</span> {formatShortDate(kachaInvoice.invoiceDate)}
            </p>
            {kachaInvoice.status !== "PAID" && (
              <p>
                <span className="font-semibold">Status:</span> {STATUS_LABELS[kachaInvoice.status] ?? kachaInvoice.status}
              </p>
            )}
          </div>
        </div>

        <table className="w-full border-collapse bg-white">
          <thead>
            <tr className="border-b-2 border-amber-600 [&>th]:p-2 [&>th]:text-left [&>th]:font-serif [&>th]:text-[11px] [&>th]:font-semibold [&>th]:normal-case [&>th]:tracking-wide [&>th]:text-slate-900">
              <th className="w-6">#</th>
              <th>Item name</th>
              <th className="text-right">Quantity</th>
              <th>Unit</th>
              <th className="text-right">Rate/ Unit</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {kachaInvoice.items.map((item: KachaInvoice["items"][number], index: number) => {
              const { qty, unit } = lineQuantity(item)
              return (
                <tr key={item.id} className="border-b border-amber-100 bg-white align-top [&>td]:p-2">
                  <td>{index + 1}</td>
                  <td className="font-medium">{item.itemName}</td>
                  <td className="text-right whitespace-nowrap">{unit === "Pcs" ? qty : qty.toFixed(3)}</td>
                  <td>{unit}</td>
                  <td className="text-right whitespace-nowrap">₹{fmt(Number(item.rate ?? 0))}</td>
                  <td className="text-right whitespace-nowrap font-medium">₹{fmt(item.lineTotal)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            {hasBankDetails && (
              <div>
                <p className="font-serif font-semibold tracking-wide text-amber-700">Pay To</p>
                {settings.bankName && <p>Bank Name : {settings.bankName}</p>}
                {settings.bankAccountNumber && <p>Bank Account No. : {settings.bankAccountNumber}</p>}
                {settings.bankIfscCode && <p>Bank IFSC code : {settings.bankIfscCode}</p>}
                {settings.bankAccountHolderName && (
                  <p>Account holder&apos;s name : {settings.bankAccountHolderName}</p>
                )}
              </div>
            )}

            <div>
              <p className="font-serif font-semibold tracking-wide text-amber-700">Amount In Words</p>
              <p>{amountInWords(kachaInvoice.totalAmount)}</p>
            </div>

            <div className="pt-6">
              <p>For : {settings.businessName}</p>
              <div className="mt-10 w-40 border-t border-slate-400 pt-1 text-[10px] font-medium">
                Authorized Signatory
              </div>
            </div>
          </div>

          <div className="justify-self-end w-full max-w-[260px] overflow-hidden rounded-md border border-amber-300">
            <div className="flex justify-between border-b border-amber-200 p-1.5">
              <span>Sub Total</span>
              <span>₹{fmt(subtotal)}</span>
            </div>
            {kachaInvoice.discount > 0 && (
              <div className="flex justify-between border-b border-amber-200 p-1.5">
                <span>Discount</span>
                <span>-₹{fmt(kachaInvoice.discount)}</span>
              </div>
            )}
            {kachaInvoice.roundOffAmount !== 0 && (
              <div className="flex justify-between border-b border-amber-200 p-1.5">
                <span>Round Off</span>
                <span>
                  {kachaInvoice.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(kachaInvoice.roundOffAmount))}
                </span>
              </div>
            )}
            <div className="flex justify-between border-b border-amber-200 bg-white p-1.5 font-bold text-amber-700">
              <span>Total</span>
              <span>₹{fmt(kachaInvoice.totalAmount)}</span>
            </div>
            <div className="flex justify-between border-b border-amber-200 p-1.5">
              <span>Received</span>
              <span>₹{fmt(kachaInvoice.paidAmount)}</span>
            </div>
            <div className="flex justify-between p-1.5 font-bold text-red-600">
              <span>Balance</span>
              <span>₹{fmt(kachaInvoice.balanceAmount)}</span>
            </div>
          </div>
        </div>

        {kachaInvoice.notes && (
          <div className="border-t border-amber-200 pt-3">
            <p className="font-serif font-semibold tracking-wide text-amber-700">Notes</p>
            <p className="whitespace-pre-wrap">{kachaInvoice.notes}</p>
          </div>
        )}
      </div>
    </main>
  )
}
