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

/** `background-clip: text` needs the vendor-prefixed inline properties too —
 * the Tailwind utility classes alone don't carry through reliably in every
 * print/PDF renderer — so every gold-gradient heading pairs its className
 * with this inline style. */
const GOLD_TEXT_STYLE = {
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
} as const

const GOLD_TEXT_CLASS = "bg-gradient-to-r from-amber-700 via-amber-500 to-amber-700 bg-clip-text text-transparent"

/** One ~18px ornamental corner bracket — two nested border-only L-shapes in
 * amber, echoing the card's own double gold border frame. */
function CornerFlourish({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const outerByPosition: Record<typeof position, string> = {
    tl: "left-1 top-1 border-l-2 border-t-2",
    tr: "right-1 top-1 border-r-2 border-t-2",
    bl: "left-1 bottom-1 border-l-2 border-b-2",
    br: "right-1 bottom-1 border-r-2 border-b-2",
  }
  const innerByPosition: Record<typeof position, string> = {
    tl: "left-1 top-1 border-l border-t",
    tr: "right-1 top-1 border-r border-t",
    bl: "left-1 bottom-1 border-l border-b",
    br: "right-1 bottom-1 border-r border-b",
  }
  return (
    <div className={`pointer-events-none absolute h-[18px] w-[18px] border-amber-400 ${outerByPosition[position]}`}>
      <div className={`absolute h-2.5 w-2.5 border-amber-300 ${innerByPosition[position]}`} />
    </div>
  )
}

/** The small centered ornament — thin amber line, rotated diamond dot, thin
 * amber line — used between major sections in place of a plain rule. */
function SectionOrnament() {
  return (
    <div className="flex items-center justify-center gap-2">
      <span className="h-px w-10 bg-amber-300" />
      <span className="h-1 w-1 rotate-45 bg-amber-400" />
      <span className="h-px w-10 bg-amber-300" />
    </div>
  )
}

/**
 * ELEGANT A4 layout for a Kacha Slip — a boutique/luxury jewellery-store
 * print piece: gold-gradient serif headings, a double-line gold border
 * frame with ornamental corner flourishes, small centered diamond dividers
 * between sections, and an ivory-tinted totals card with a gradient-gold
 * Total row. A faint centered logo watermark sits behind the whole card
 * when `settings.logoUrl` is set.
 */
export function KachaPrintElegant({ kachaInvoice, settings }: KachaPrintElegantProps) {
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

      <div className="border-2 border-amber-300 p-1">
        <div className="relative border border-amber-200 p-6">
          <CornerFlourish position="tl" />
          <CornerFlourish position="tr" />
          <CornerFlourish position="bl" />
          <CornerFlourish position="br" />

          {settings.logoUrl && (
            // Decorative watermark only — no alt text, never affects layout.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logoUrl}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 m-auto h-[360px] w-[360px] object-contain opacity-[0.14]"
            />
          )}

          <div className="relative z-10 space-y-4">
            <div className="space-y-1 text-center">
              {settings.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.logoUrl}
                  alt={settings.businessName}
                  className="mx-auto mb-2 h-14 w-14 rounded-full object-cover ring-1 ring-amber-200"
                />
              )}
              <p className={`font-serif text-2xl font-bold tracking-wide ${GOLD_TEXT_CLASS}`} style={GOLD_TEXT_STYLE}>
                {settings.businessName}
              </p>
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
              <p className={`font-serif text-lg font-semibold tracking-wide ${GOLD_TEXT_CLASS}`} style={GOLD_TEXT_STYLE}>
                Kacha Slip
              </p>
              {kachaInvoice.convertedTo && (
                <p className="text-[10px] text-slate-500">
                  Converted to Tax Invoice{" "}
                  <Link href={`/billing/${kachaInvoice.convertedTo.id}`} className="text-amber-700 underline">
                    {kachaInvoice.convertedTo.invoiceNumber}
                  </Link>
                </p>
              )}
            </div>

            <SectionOrnament />

            <div className="flex flex-wrap items-start justify-between gap-4">
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

            <SectionOrnament />

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

              <div className="justify-self-end w-full max-w-[260px] overflow-hidden rounded-md border border-amber-200 bg-amber-50/40">
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
                <div className="flex justify-between border-b border-amber-200 p-1.5 font-bold">
                  <span className={GOLD_TEXT_CLASS} style={GOLD_TEXT_STYLE}>
                    Total
                  </span>
                  <span className={GOLD_TEXT_CLASS} style={GOLD_TEXT_STYLE}>
                    ₹{fmt(kachaInvoice.totalAmount)}
                  </span>
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
              <>
                <SectionOrnament />
                <div>
                  <p className="font-serif font-semibold tracking-wide text-amber-700">Notes</p>
                  <p className="whitespace-pre-wrap">{kachaInvoice.notes}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
