import Link from "next/link"

import { amountInWords } from "@/lib/number-to-words"
import { formatShortDate } from "@/lib/utils"
import type { KachaInvoice } from "@/lib/actions/kacha-invoice-actions"
import type { BusinessSettings } from "@/lib/actions/settings-actions"

type KachaPrintMinimalProps = {
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

/** One 12px L-shaped registration-mark tick, pure CSS via a bordered div —
 * four of these sit at the printable card's corners. */
function CornerTick({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const classesByPosition: Record<typeof position, string> = {
    tl: "left-1 top-1 border-l border-t",
    tr: "right-1 top-1 border-r border-t",
    bl: "left-1 bottom-1 border-l border-b",
    br: "right-1 bottom-1 border-r border-b",
  }
  return <div className={`pointer-events-none absolute h-3 w-3 border-slate-900 ${classesByPosition[position]}`} />
}

/** The thick-over-thin double rule used under the main heading and above the
 * Total row — a ~2px gap between a bold and a hairline border. */
function DoubleRule({ className = "" }: { className?: string }) {
  return (
    <div className={`space-y-[2px] ${className}`}>
      <div className="border-t-2 border-slate-900" />
      <div className="border-t border-slate-300" />
    </div>
  )
}

/**
 * MINIMAL A4 layout for a Kacha Slip — deliberately, expensively minimal
 * (a Kinfolk/Muji-style print piece): strictly grayscale, small-caps section
 * labels with wide tracking, a thick-over-thin double rule under the main
 * heading and above the Total, generous vertical whitespace, and thin
 * corner registration marks on the printable card. No color anywhere,
 * including the logo watermark, which renders extra faint and grayscale.
 */
export function KachaPrintMinimal({ kachaInvoice, settings }: KachaPrintMinimalProps) {
  const businessAddressLines = [
    settings.address,
    [settings.city, settings.state].filter(Boolean).join(", "),
  ].filter(Boolean)

  const hasBankDetails = Boolean(settings.bankName)
  const subtotal = kachaInvoice.subtotal + kachaInvoice.makingCharges + kachaInvoice.stoneCharges

  return (
    <main className="mx-auto max-w-3xl bg-white p-6 text-[13px] text-slate-900 print:max-w-none print:w-full print:p-0 print:text-[10px]">
      <style>
        {`@page { size: A4 portrait; margin: 10mm; }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }`}
      </style>

      <div className="relative border border-slate-300 p-8">
        <CornerTick position="tl" />
        <CornerTick position="tr" />
        <CornerTick position="bl" />
        <CornerTick position="br" />

        {settings.logoUrl && (
          // Extra-faint, grayscale-filtered so it stays ink-conscious even
          // when printed — decorative only, so no alt text.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={settings.logoUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 m-auto h-[360px] w-[360px] object-contain opacity-[0.09] grayscale"
          />
        )}

        <div className="relative z-10 space-y-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Business</p>
              <p className="text-xl font-bold text-slate-900">{settings.businessName}</p>
              <div className="space-y-0.5 text-[11px] text-slate-600">
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
              <p className="text-xl font-bold uppercase tracking-wide text-slate-900">Kacha Slip</p>
              <DoubleRule className="ml-auto mt-2 w-40" />
              {kachaInvoice.convertedTo && (
                <p className="mt-2 max-w-[220px] text-[10px] text-slate-600">
                  Converted to Tax Invoice{" "}
                  <Link href={`/billing/${kachaInvoice.convertedTo.id}`} className="underline">
                    {kachaInvoice.convertedTo.invoiceNumber}
                  </Link>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Bill To</p>
              <p className="font-bold">{kachaInvoice.customer?.name ?? "-"}</p>
              {kachaInvoice.customer?.phone && <p>{kachaInvoice.customer.phone}</p>}
            </div>
            <div className="space-y-1 text-right">
              <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Slip Details</p>
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

          <table className="w-full border-collapse border border-slate-400 tabular-nums">
            <thead>
              <tr className="[&>th]:border [&>th]:border-slate-400 [&>th]:border-b-2 [&>th]:p-2 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-bold [&>th]:normal-case [&>th]:tracking-normal [&>th]:text-slate-900">
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
                  <tr key={item.id} className="align-top [&>td]:border [&>td]:border-slate-300 [&>td]:p-2">
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
            <div className="space-y-6">
              {hasBankDetails && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Pay To</p>
                  {settings.bankName && <p>Bank Name : {settings.bankName}</p>}
                  {settings.bankAccountNumber && <p>Bank Account No. : {settings.bankAccountNumber}</p>}
                  {settings.bankIfscCode && <p>Bank IFSC code : {settings.bankIfscCode}</p>}
                  {settings.bankAccountHolderName && (
                    <p>Account holder&apos;s name : {settings.bankAccountHolderName}</p>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Amount In Words</p>
                <p>{amountInWords(kachaInvoice.totalAmount)}</p>
              </div>

              <div className="pt-6">
                <p>For : {settings.businessName}</p>
                <div className="mt-10 w-40 border-t border-slate-900 pt-1 text-[10px] font-medium">
                  Authorized Signatory
                </div>
              </div>
            </div>

            <div className="justify-self-end w-full max-w-[260px] tabular-nums">
              <div className="space-y-1 bg-slate-50 p-3">
                <div className="flex justify-between">
                  <span>Sub Total</span>
                  <span>₹{fmt(subtotal)}</span>
                </div>
                {kachaInvoice.discount > 0 && (
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span>-₹{fmt(kachaInvoice.discount)}</span>
                  </div>
                )}
                {kachaInvoice.roundOffAmount !== 0 && (
                  <div className="flex justify-between">
                    <span>Round Off</span>
                    <span>
                      {kachaInvoice.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(kachaInvoice.roundOffAmount))}
                    </span>
                  </div>
                )}
                <DoubleRule className="pt-1" />
                <div className="flex justify-between pt-1 text-base font-bold">
                  <span>Total</span>
                  <span>₹{fmt(kachaInvoice.totalAmount)}</span>
                </div>
              </div>
              <div className="flex justify-between px-3 pt-2">
                <span>Received</span>
                <span>₹{fmt(kachaInvoice.paidAmount)}</span>
              </div>
              <div className="flex justify-between px-3 font-bold">
                <span>Balance</span>
                <span>₹{fmt(kachaInvoice.balanceAmount)}</span>
              </div>
            </div>
          </div>

          {kachaInvoice.notes && (
            <div className="space-y-1 border-t border-slate-300 pt-4">
              <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Notes</p>
              <p className="whitespace-pre-wrap">{kachaInvoice.notes}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
