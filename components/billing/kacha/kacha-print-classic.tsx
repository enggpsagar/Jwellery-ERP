import Link from "next/link"
import { Phone, Mail, MapPin } from "lucide-react"

import { amountInWords } from "@/lib/number-to-words"
import { formatShortDate } from "@/lib/utils"
import type { KachaInvoice } from "@/lib/actions/kacha-invoice-actions"
import type { BusinessSettings } from "@/lib/actions/settings-actions"

type KachaPrintClassicProps = {
  kachaInvoice: KachaInvoice
  settings: BusinessSettings
}

function fmt(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Same per-line qty/unit resolution as Invoice's own lineQuantity —
 * duplicated rather than shared, matching this codebase's convention of a
 * small pure per-file helper over a shared import for print-page logic. */
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
 * CLASSIC A4 layout for a Kacha Slip — the same visual language as
 * Invoice's own Classic template (violet contact bar, dark curved-corner
 * identity block, violet-header items table, boxed totals summary), built
 * fresh here since a Kacha Slip has no GST fields at all (no tax rows/
 * columns, no rate-wise summary) — see KachaInvoice's own doc comment.
 */
export function KachaPrintClassic({ kachaInvoice, settings }: KachaPrintClassicProps) {
  const businessAddressLines = [
    settings.address,
    [settings.city, settings.state].filter(Boolean).join(", "),
  ].filter(Boolean)

  const hasBankDetails = Boolean(settings.bankName)
  const subtotal = kachaInvoice.subtotal + kachaInvoice.makingCharges + kachaInvoice.stoneCharges

  return (
    <main className="mx-auto max-w-3xl space-y-4 bg-white p-6 text-[13px] text-slate-900 print:max-w-none print:w-full print:p-0 print:text-[10px]">
      {/* Forces background colors (violet bar, table header, Total row) to
          print by default — see Invoice's identical rule for why this is
          necessary rather than cosmetic. */}
      <style>
        {`@page { size: A4 portrait; margin: 10mm; }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }`}
      </style>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl print:rounded-none print:border-slate-400 print:shadow-none">
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
                className="relative mr-6 h-14 w-14 shrink-0 self-end rounded-full object-cover ring-2 ring-white/30"
              />
            )}
          </div>
          <div className="flex flex-1 items-center justify-end px-5 py-4 text-right">
            <div>
              <p className="font-serif text-2xl font-bold text-slate-900">Kacha Slip</p>
              {kachaInvoice.convertedTo && (
                <p className="max-w-[220px] text-[10px] italic text-slate-600">
                  Converted to Tax Invoice{" "}
                  <Link href={`/billing/${kachaInvoice.convertedTo.id}`} className="underline">
                    {kachaInvoice.convertedTo.invoiceNumber}
                  </Link>
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-300 p-4">
          <div className="space-y-0.5">
            <p className="font-semibold text-violet-600">Bill To:</p>
            <p className="text-base font-bold">{kachaInvoice.customer?.name ?? "-"}</p>
            {kachaInvoice.customer?.phone && <p>Contact No.: {kachaInvoice.customer.phone}</p>}
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

        {/* Every th/td below overrides globals.css's site-wide
            `table thead th` rule the same way Invoice's own table does —
            see that file's identical comment. */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-violet-400 [&>th]:border [&>th]:border-white/30 [&>th]:p-2 [&>th]:text-left [&>th]:align-middle [&>th]:text-[11px] [&>th]:font-semibold [&>th]:normal-case [&>th]:tracking-normal [&>th]:whitespace-normal [&>th]:text-white">
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
                  className="[&>td]:border [&>td]:border-slate-300 [&>td]:p-2 align-top odd:bg-white even:bg-slate-50"
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
            <tr className="bg-violet-400 font-semibold text-white [&>td]:border [&>td]:border-white/30 [&>td]:p-2">
              <td colSpan={5} className="text-right">
                Total
              </td>
              <td className="text-right whitespace-nowrap">₹{fmt(kachaInvoice.totalAmount)}</td>
            </tr>
          </tbody>
        </table>

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
              <p className="font-medium text-violet-600">Amount In Words</p>
              <p>{amountInWords(kachaInvoice.totalAmount)}</p>
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
            {kachaInvoice.discount > 0 && (
              <div className="flex justify-between border-b border-slate-300 p-1.5">
                <span>Discount</span>
                <span>-₹{fmt(kachaInvoice.discount)}</span>
              </div>
            )}
            {kachaInvoice.roundOffAmount !== 0 && (
              <div className="flex justify-between border-b border-slate-300 p-1.5">
                <span>Round Off</span>
                <span>
                  {kachaInvoice.roundOffAmount > 0 ? "+" : "-"}₹{fmt(Math.abs(kachaInvoice.roundOffAmount))}
                </span>
              </div>
            )}
            <div className="flex justify-between bg-violet-400 p-1.5 font-semibold text-white">
              <span>Total</span>
              <span>₹{fmt(kachaInvoice.totalAmount)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-300 p-1.5">
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
          <div className="border-t-2 border-slate-300 p-4">
            <p className="font-semibold">Notes</p>
            <p className="whitespace-pre-wrap">{kachaInvoice.notes}</p>
          </div>
        )}

        <div className="h-2 bg-gradient-to-r from-indigo-600 to-slate-900" />
      </div>
    </main>
  )
}
