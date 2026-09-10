import Link from "next/link"

import { amountInWords } from "@/lib/number-to-words"
import { formatShortDate } from "@/lib/utils"
import type { KachaInvoice } from "@/lib/actions/kacha-invoice-actions"
import type { BusinessSettings } from "@/lib/actions/settings-actions"

type KachaPrintModernProps = {
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
 * MODERN A4 layout for a Kacha Slip — light/airy, no color bands or curved
 * shapes. Indigo is used sparingly: a thin rule under the business name and
 * the Total row's light tint, nowhere else. Plain identity block (no dark
 * band), alternating white/slate-50 item rows, a plain bordered totals box.
 */
export function KachaPrintModern({ kachaInvoice, settings }: KachaPrintModernProps) {
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

      <div className="space-y-6 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-3">
          <div>
            {settings.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.logoUrl}
                alt={settings.businessName}
                className="mb-2 h-12 w-12 rounded-full object-cover"
              />
            )}
            <p className="text-xl font-bold tracking-tight text-slate-900">{settings.businessName}</p>
            <div className="mt-1 w-24 border-b-2 border-indigo-500" />
            <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
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
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-slate-900">Kacha Slip</p>
            {kachaInvoice.convertedTo && (
              <p className="mt-1 max-w-[220px] text-[10px] text-slate-500">
                Converted to Tax Invoice{" "}
                <Link href={`/billing/${kachaInvoice.convertedTo.id}`} className="text-indigo-600 underline">
                  {kachaInvoice.convertedTo.invoiceNumber}
                </Link>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4 border-t border-slate-200 pt-4">
          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Bill To</p>
            <p className="text-base font-semibold text-slate-900">{kachaInvoice.customer?.name ?? "-"}</p>
            {kachaInvoice.customer?.phone && <p className="text-slate-600">{kachaInvoice.customer.phone}</p>}
          </div>
          <div className="space-y-0.5 text-right text-slate-600">
            <p>
              <span className="text-slate-400">Slip No.: </span>
              {kachaInvoice.slipNumber}
            </p>
            <p>
              <span className="text-slate-400">Date: </span>
              {formatShortDate(kachaInvoice.invoiceDate)}
            </p>
            {kachaInvoice.status !== "PAID" && (
              <p>
                <span className="text-slate-400">Status: </span>
                {STATUS_LABELS[kachaInvoice.status] ?? kachaInvoice.status}
              </p>
            )}
          </div>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-300 [&>th]:p-2 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-semibold [&>th]:normal-case [&>th]:tracking-normal [&>th]:text-slate-600">
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
                <tr
                  key={item.id}
                  className="border-b border-slate-200 align-top odd:bg-white even:bg-slate-50 [&>td]:p-2"
                >
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
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pay To</p>
                {settings.bankName && <p>Bank Name : {settings.bankName}</p>}
                {settings.bankAccountNumber && <p>Bank Account No. : {settings.bankAccountNumber}</p>}
                {settings.bankIfscCode && <p>Bank IFSC code : {settings.bankIfscCode}</p>}
                {settings.bankAccountHolderName && (
                  <p>Account holder&apos;s name : {settings.bankAccountHolderName}</p>
                )}
              </div>
            )}

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Amount In Words</p>
              <p>{amountInWords(kachaInvoice.totalAmount)}</p>
            </div>

            <div className="pt-6">
              <p>For : {settings.businessName}</p>
              <div className="mt-10 w-40 border-t border-slate-400 pt-1 text-[10px] font-medium text-slate-600">
                Authorized Signatory
              </div>
            </div>
          </div>

          <div className="justify-self-end w-full max-w-[260px] overflow-hidden rounded-md border border-slate-300">
            <div className="flex justify-between border-b border-slate-200 p-1.5">
              <span>Sub Total</span>
              <span>₹{fmt(subtotal)}</span>
            </div>
            {kachaInvoice.discount > 0 && (
              <div className="flex justify-between border-b border-slate-200 p-1.5">
                <span>Discount</span>
                <span>-₹{fmt(kachaInvoice.discount)}</span>
              </div>
            )}
            {kachaInvoice.roundOffAmount !== 0 && (
              <div className="flex justify-between border-b border-slate-200 p-1.5">
                <span>Round Off</span>
                <span>
                  {kachaInvoice.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(kachaInvoice.roundOffAmount))}
                </span>
              </div>
            )}
            <div className="flex justify-between border-b border-slate-200 bg-indigo-50 p-1.5 font-semibold text-indigo-700">
              <span>Total</span>
              <span>₹{fmt(kachaInvoice.totalAmount)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 p-1.5">
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
          <div className="border-t border-slate-200 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Notes</p>
            <p className="whitespace-pre-wrap">{kachaInvoice.notes}</p>
          </div>
        )}
      </div>
    </main>
  )
}
