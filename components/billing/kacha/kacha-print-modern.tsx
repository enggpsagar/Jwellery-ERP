import Link from "next/link"
import { Phone, Mail, MapPin } from "lucide-react"

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

/** Status pill fill on the header band — green once settled, amber while
 * in progress, red once cancelled. */
const STATUS_PILL_CLASSES: Record<string, string> = {
  DRAFT: "bg-amber-400 text-amber-950",
  PARTIAL: "bg-amber-400 text-amber-950",
  PAID: "bg-emerald-400 text-emerald-950",
  CANCELLED: "bg-red-400 text-red-950",
}

/**
 * MODERN A4 layout for a Kacha Slip — a premium SaaS-billing look (Stripe/
 * Linear-style documents): an indigo gradient header band carrying the
 * business identity and a colored status pill, a rounded items table with an
 * indigo-tinted header row, and a totals card whose Total row repeats the
 * same gradient fill. A large, very faint centered logo watermark sits
 * behind the whole card when `settings.logoUrl` is set.
 */
export function KachaPrintModern({ kachaInvoice, settings }: KachaPrintModernProps) {
  const businessAddressLines = [
    settings.address,
    [settings.city, settings.state].filter(Boolean).join(", "),
  ].filter(Boolean)

  const hasBankDetails = Boolean(settings.bankName)
  const subtotal = kachaInvoice.subtotal + kachaInvoice.makingCharges + kachaInvoice.stoneCharges
  const statusPillClass = STATUS_PILL_CLASSES[kachaInvoice.status] ?? "bg-white/25 text-white"

  return (
    <main className="mx-auto max-w-3xl bg-white p-6 text-[13px] text-slate-900 print:max-w-none print:w-full print:p-0 print:text-[10px]">
      {/* Forces the header/table/total gradients and tints to print by
          default — see Classic's identical rule for why this is necessary
          rather than cosmetic. */}
      <style>
        {`@page { size: A4 portrait; margin: 10mm; }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }`}
      </style>

      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg print:rounded-none print:border-slate-400 print:shadow-none">
        {settings.logoUrl && (
          // Faint watermark behind the entire card — decorative only, so it
          // carries no alt text and never shifts layout.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={settings.logoUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 m-auto h-[360px] w-[360px] object-contain opacity-[0.14]"
          />
        )}

        <div className="relative z-10">
          <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-indigo-600 to-indigo-400 px-6 py-5 text-white">
            <div className="flex items-center gap-3">
              {settings.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.logoUrl}
                  alt={settings.businessName}
                  className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-white/40"
                />
              )}
              <div className="space-y-1">
                <p className="text-2xl font-bold tracking-tight">{settings.businessName}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-indigo-100">
                  {settings.gstNumber && <span>GSTIN: {settings.gstNumber}</span>}
                  {settings.state && (
                    <span>
                      State: {settings.stateCode ? `${settings.stateCode}-` : ""}
                      {settings.state}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-indigo-100">
                  {settings.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {settings.phone}
                    </span>
                  )}
                  {settings.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {settings.email}
                    </span>
                  )}
                  {businessAddressLines.length > 0 && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {businessAddressLines.join(", ")}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold">Kacha Slip</p>
              <span className={`mt-1 inline-block rounded-full px-3 py-0.5 text-[11px] font-semibold ${statusPillClass}`}>
                {STATUS_LABELS[kachaInvoice.status] ?? kachaInvoice.status}
              </span>
              {kachaInvoice.convertedTo && (
                <p className="mt-1.5 max-w-[220px] text-[10px] text-indigo-100">
                  Converted to Tax Invoice{" "}
                  <Link href={`/billing/${kachaInvoice.convertedTo.id}`} className="underline">
                    {kachaInvoice.convertedTo.invoiceNumber}
                  </Link>
                </p>
              )}
            </div>
          </div>

          <div className="space-y-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
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
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-indigo-50 [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-semibold [&>th]:normal-case [&>th]:tracking-normal [&>th]:text-indigo-700">
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
                        className="align-top odd:bg-white even:bg-indigo-50/40 [&>td]:border-t [&>td]:border-slate-100 [&>td]:px-3 [&>td]:py-2.5"
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
            </div>

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

              <div className="justify-self-end w-full max-w-[260px] overflow-hidden rounded-lg border border-slate-200 shadow-sm">
                <div className="flex justify-between border-b border-slate-100 px-3 py-1.5">
                  <span>Sub Total</span>
                  <span>₹{fmt(subtotal)}</span>
                </div>
                {kachaInvoice.discount > 0 && (
                  <div className="flex justify-between border-b border-slate-100 px-3 py-1.5">
                    <span>Discount</span>
                    <span>-₹{fmt(kachaInvoice.discount)}</span>
                  </div>
                )}
                {kachaInvoice.roundOffAmount !== 0 && (
                  <div className="flex justify-between border-b border-slate-100 px-3 py-1.5">
                    <span>Round Off</span>
                    <span>
                      {kachaInvoice.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(kachaInvoice.roundOffAmount))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between bg-gradient-to-r from-indigo-600 to-indigo-400 px-3 py-2 font-bold text-white">
                  <span>Total</span>
                  <span>₹{fmt(kachaInvoice.totalAmount)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 px-3 py-1.5">
                  <span>Received</span>
                  <span>₹{fmt(kachaInvoice.paidAmount)}</span>
                </div>
                <div className="flex justify-between px-3 py-1.5 font-bold text-red-600">
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
        </div>
      </div>
    </main>
  )
}
