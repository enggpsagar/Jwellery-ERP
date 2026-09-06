import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"

import { getCreditNoteById } from "@/lib/actions/credit-note-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { InvoicePrintButton } from "@/components/billing/invoice-print-button"

type Props = {
  params: Promise<{ id: string }>
}

const getCreditNote = cache(getCreditNoteById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const creditNote = await getCreditNote(id)
    return { title: creditNote ? `Credit Note ${creditNote.creditNoteNumber}` : "Credit Note" }
  } catch {
    return { title: "Credit Note" }
  }
}

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

/**
 * Deliberately simpler than the invoice print page — no per-line GST
 * breakdown/standard-rate banner. A returned line's refund already folds
 * in whatever GST it originally carried (see createCreditNote's per-unit
 * lineTotal math), so this states the net amount refunded rather than
 * re-itemizing tax components; revisit if GST filing ever needs a credit
 * note to show CGST/SGST/IGST reversed separately.
 */
export default async function CreditNotePrintPage({ params }: Props) {
  const { id } = await params

  const [creditNote, settings] = await Promise.all([getCreditNote(id), getBusinessSettings()])
  if (!creditNote) notFound()

  const businessAddressLines = [
    settings.address,
    [settings.city, settings.state].filter(Boolean).join(", "),
    settings.pincode ? `PINCODE: ${settings.pincode}` : null,
  ].filter(Boolean)

  const customerAddressLines = [
    creditNote.customer?.addressLine1,
    creditNote.customer?.addressLine2,
    [creditNote.customer?.city, creditNote.customer?.state].filter(Boolean).join(", "),
    creditNote.customer?.pincode,
  ].filter(Boolean)

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6 text-xs text-black print:max-w-none print:w-full print:p-0 print:text-[8px]">
      <style>{"@page { size: A4 portrait; margin: 8mm; }"}</style>

      <div className="flex justify-end print:hidden">
        <InvoicePrintButton />
      </div>

      <div className="border border-black">
        <div className="border-b border-black p-2 text-center">
          <p className="text-sm font-bold uppercase tracking-wide">Credit Note</p>
        </div>

        <div className="flex flex-wrap justify-between gap-2 border-b border-black p-2 font-medium">
          <span>Credit Note No : {creditNote.creditNoteNumber}</span>
          <span>Date : {fmtDate(creditNote.creditNoteDate)}</span>
          <span>Against Invoice : {creditNote.invoice.invoiceNumber}</span>
          <span>Invoice Date : {fmtDate(creditNote.invoice.invoiceDate)}</span>
          {creditNote.locationName && <span>Location : {creditNote.locationName}</span>}
        </div>

        <div className="grid grid-cols-2 border-b border-black">
          <div className="border-r border-black p-2 space-y-0.5">
            <p className="font-semibold">{settings.businessName}</p>
            {businessAddressLines.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            {settings.phone && <p>Phone Number : {settings.phone}</p>}
            {settings.gstNumber && <p>GSTIN : {settings.gstNumber}</p>}
          </div>
          <div className="p-2 space-y-0.5">
            <p className="font-semibold">{creditNote.customer?.name ?? "-"}</p>
            {customerAddressLines.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            {creditNote.customer?.phone && <p>Phone Number : {creditNote.customer.phone}</p>}
            {creditNote.customer?.gstin && <p>GSTIN : {creditNote.customer.gstin}</p>}
          </div>
        </div>

        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col style={{ width: "10%" }} />
            <col style={{ width: "50%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-black [&>th]:border-r [&>th]:border-black [&>th]:p-1 [&>th]:text-left last:[&>th]:border-r-0">
              <th>#</th>
              <th>Item</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {creditNote.items.map((item, index) => (
              <tr
                key={item.id}
                className="border-b border-black [&>td]:border-r [&>td]:border-black [&>td]:p-1 last:[&>td]:border-r-0"
              >
                <td>{index + 1}</td>
                <td>{item.itemName}</td>
                <td className="text-right">{item.quantity}</td>
                <td className="text-right">{item.rate ? item.rate.toFixed(2) : "-"}</td>
                <td className="text-right">{item.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="[&>td]:border-r [&>td]:border-black [&>td]:p-1 last:[&>td]:border-r-0">
              <td colSpan={4} className="text-right font-semibold">
                Total Refunded
              </td>
              <td className="text-right font-semibold">{creditNote.totalAmount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        {creditNote.reason && (
          <div className="border-t border-black p-2">
            <span className="font-semibold">Reason: </span>
            {creditNote.reason}
          </div>
        )}

        <div className="border-t border-black p-2">
          This amount has been credited to the customer's account ledger against invoice{" "}
          {creditNote.invoice.invoiceNumber}.
        </div>
      </div>
    </main>
  )
}
