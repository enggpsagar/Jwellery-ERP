import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"

import { getInvoiceById } from "@/lib/actions/invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getLatestMetalRates } from "@/lib/actions/metal-rate-actions"
import { amountInWords } from "@/lib/number-to-words"
import { InvoicePrintButton } from "@/components/billing/invoice-print-button"
import { documentHeading, COMPOSITION_DISCLAIMER } from "@/lib/gst"

type Props = {
  params: Promise<{ id: string }>
}

const getInvoice = cache(getInvoiceById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const invoice = await getInvoice(id)
    return { title: invoice ? `Invoice ${invoice.invoiceNumber}` : "Invoice" }
  } catch {
    return { title: "Invoice" }
  }
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  NET_BANKING: "Net Banking",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
}

function fmt(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PARTIAL: "Partially Paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
}

export default async function InvoicePrintPage({ params }: Props) {
  const { id } = await params

  const [invoice, settings, metalRates] = await Promise.all([
    getInvoice(id),
    getBusinessSettings(),
    getLatestMetalRates(),
  ])

  if (!invoice) notFound()

  const rate = metalRates.latest
  const businessAddressLines = [settings.address, [settings.city, settings.state].filter(Boolean).join(", "), settings.pincode ? `PINCODE: ${settings.pincode}` : null]
    .filter(Boolean)

  const customerAddressLines = [
    invoice.customer?.addressLine1,
    invoice.customer?.addressLine2,
    [invoice.customer?.city, invoice.customer?.state].filter(Boolean).join(", "),
    invoice.customer?.pincode,
  ].filter(Boolean)

  const totalQty = invoice.items.reduce((sum, item) => sum + item.quantity, 0)
  const totalGrossWeight = invoice.items.reduce((sum, item) => sum + (item.grossWeight ?? 0), 0)
  const totalStoneWeight = invoice.items.reduce((sum, item) => sum + (item.stoneWeight ?? 0), 0)
  const totalNetWeight = invoice.items.reduce((sum, item) => sum + (item.netWeight ?? 0), 0)
  const totalGrossPrice = invoice.items.reduce(
    (sum, item) => sum + (item.rate ?? 0) * (item.netWeight ?? 0),
    0,
  )
  const totalMaking = invoice.items.reduce((sum, item) => sum + item.makingCharge, 0)
  const totalHm = invoice.items.reduce((sum, item) => sum + item.hmCharge, 0)
  const totalStoneCharge = invoice.items.reduce((sum, item) => sum + item.stoneCharge, 0)
  const totalSchemeDiscount = invoice.items.reduce((sum, item) => sum + item.schemeDiscount, 0)
  const totalSgst = invoice.items.reduce((sum, item) => sum + item.sgstAmount, 0)
  const totalCgst = invoice.items.reduce((sum, item) => sum + item.cgstAmount, 0)
  const totalIgst = invoice.items.reduce((sum, item) => sum + item.igstAmount, 0)
  // An invoice is either wholly intra-state or wholly inter-state — one
  // customer, one shipping state — so the presence of any IGST at all is
  // enough to pick the column layout for the whole document.
  const isInterState = totalIgst > 0
  const heading = documentHeading(settings.gstScheme)

  const payments = invoice.ledgerEntries.filter((entry) => entry.amount > 0)
  const totalPaid = payments.reduce((sum, entry) => sum + entry.amount, 0)

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6 text-xs text-black print:max-w-none print:w-full print:p-0 print:text-[8px]">
      {/* Portrait A4, tight margins — the line-item table's own column
          widths/headers are sized to fit this, not the other way around. */}
      <style>{"@page { size: A4 portrait; margin: 8mm; }"}</style>

      <div className="flex justify-end print:hidden">
        <InvoicePrintButton />
      </div>

      <div className="border border-black">
        {/* A Composition dealer legally cannot print "Tax Invoice" — it
            must say "Bill of Supply", with the disclaimer below it. See
            documentHeading()/COMPOSITION_DISCLAIMER in lib/gst.ts. */}
        <div className="border-b border-black p-2 text-center">
          <p className="text-sm font-bold uppercase tracking-wide">{heading}</p>
          {settings.gstScheme === "COMPOSITION" && (
            <p className="text-[10px] italic">{COMPOSITION_DISCLAIMER}</p>
          )}
        </div>

        {/* Invoice No/Date is the one thing a tax invoice can never omit —
            previously this only ever reached the browser tab title, never
            the printed page itself. */}
        <div className="flex flex-wrap justify-between gap-2 border-b border-black p-2 font-medium">
          <span>Invoice No : {invoice.invoiceNumber}</span>
          <span>Invoice Date : {fmtDate(invoice.invoiceDate)}</span>
          {invoice.dueDate && <span>Due Date : {fmtDate(invoice.dueDate)}</span>}
          {invoice.locationName && <span>Location : {invoice.locationName}</span>}
          {invoice.status !== "PAID" && (
            <span>Status : {STATUS_LABELS[invoice.status] ?? invoice.status}</span>
          )}
        </div>

        {/* Header: business (left) / customer (right) */}
        <div className="grid grid-cols-2 border-b border-black">
          <div className="border-r border-black p-2 space-y-0.5">
            <p className="font-semibold">{settings.businessName}</p>
            {businessAddressLines.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            {settings.phone && <p>Phone Number : {settings.phone}</p>}
            {settings.gstNumber && <p>GSTIN : {settings.gstNumber}</p>}
            {settings.stateCode && <p>State Code : {settings.stateCode}</p>}
            {settings.cin && <p>CIN : {settings.cin}</p>}
          </div>
          <div className="p-2 space-y-0.5">
            <p className="font-semibold">{invoice.customer?.name ?? "-"}</p>
            {customerAddressLines.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            {invoice.customer?.phone && <p>Phone Number : {invoice.customer.phone}</p>}
            {invoice.customer?.registrationId && (
              <p>Encircle Id : {invoice.customer.registrationId}</p>
            )}
            {invoice.customer?.panNumber && <p>PAN : {invoice.customer.panNumber}</p>}
          </div>
        </div>

        {/* Standard rate banner */}
        {rate && (
          <div className="border-b border-black p-2 text-center font-medium">
            Standard Rate of 24 Karat/22 Karat/18 Karat{rate.gold14k ? "/14 Karat" : ""} Gold Rs:{" "}
            {fmt(Number(rate.gold24k))}/{fmt(Number(rate.gold22k))}/{fmt(Number(rate.gold18k))}
            {rate.gold14k ? `/${fmt(Number(rate.gold14k))}` : ""} Rs/g
            {rate.platinum95 ? (
              <> · Standard Rate of 95.00% Purity Platinum: Rs {fmt(Number(rate.platinum95))}</>
            ) : null}
          </div>
        )}

        {/* Line items */}
        <table className="w-full table-fixed border-collapse">
          {/* table-fixed + explicit widths, not auto layout — auto layout
              sizes every column to its widest cell on one line, which made
              this 12-13 column table wider than a printed page. */}
          <colgroup>
            <col style={{ width: "17%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "4%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            {isInterState ? (
              <col style={{ width: "10%" }} />
            ) : (
              <>
                <col style={{ width: "5%" }} />
                <col style={{ width: "5%" }} />
              </>
            )}
            <col style={{ width: "9%" }} />
          </colgroup>
          <thead>
            {/* The site-wide `table thead th` rule (globals.css) forces
                small-caps, nowrap, muted-gray headers meant for the app's
                data-table cards — on this narrow, fixed-width, 12+ column
                table that nowrap is exactly what forced every header onto
                one overflowing line, visually overlapping its neighbors.
                Overridden here (a class targeting the element itself always
                outranks that bare-element selector) so headers wrap onto
                their own 2-3 lines and fit their column instead. */}
            <tr className="border-b border-black [&>th]:border-r [&>th]:border-black [&>th]:p-1 print:[&>th]:p-0.5 [&>th:last-child]:border-r-0 [&>th]:whitespace-normal [&>th]:normal-case [&>th]:tracking-normal [&>th]:text-black [&>th]:font-semibold [&>th]:text-[8px] print:[&>th]:text-[6.5px] [&>th]:leading-tight [&>th]:align-bottom">
              <th className="text-left">Item Description</th>
              <th>Purity/HSN</th>
              <th>Qty</th>
              <th>Gross Wt (g)</th>
              <th>Stone Wt (g)</th>
              <th>Net Wt (g)</th>
              <th>Gross Price (Rs.)</th>
              <th>Making (Rs.)</th>
              <th>Stone (Rs.)</th>
              <th>Discount (Rs.)</th>
              {/* One customer, one shipping state — an invoice is either
                  wholly intra-state or wholly inter-state, never a mix, so
                  the column choice is made once for the whole table. */}
              {isInterState ? (
                <th>IGST</th>
              ) : (
                <>
                  <th>SGST</th>
                  <th>CGST</th>
                </>
              )}
              <th>Value (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-b border-black [&>td]:border-r [&>td]:border-black [&>td]:p-1 print:[&>td]:p-0.5 [&>td:last-child]:border-r-0 align-top">
                <td>{item.itemName}</td>
                <td>
                  {item.purity ?? "-"}
                  {item.hsnCode ? <span className="block">{item.hsnCode}</span> : null}
                </td>
                <td className="text-center">{item.quantity}N</td>
                <td className="text-right whitespace-nowrap">{(item.grossWeight ?? 0).toFixed(3)}</td>
                <td className="text-right whitespace-nowrap">{(item.stoneWeight ?? 0).toFixed(3)}</td>
                <td className="text-right whitespace-nowrap">{(item.netWeight ?? 0).toFixed(3)}</td>
                <td className="text-right whitespace-nowrap">{fmt((item.rate ?? 0) * (item.netWeight ?? 0))}</td>
                <td className="text-right whitespace-nowrap">
                  {fmt(item.makingCharge)}
                  {item.hmCharge > 0 ? <span className="block">HM {fmt(item.hmCharge)}</span> : null}
                </td>
                <td className="text-right whitespace-nowrap">{fmt(item.stoneCharge)}</td>
                <td className="text-right whitespace-nowrap">{fmt(item.schemeDiscount)}</td>
                {isInterState ? (
                  <td className="text-right whitespace-nowrap">{fmt(item.igstAmount)}</td>
                ) : (
                  <>
                    <td className="text-right whitespace-nowrap">{fmt(item.sgstAmount)}</td>
                    <td className="text-right whitespace-nowrap">{fmt(item.cgstAmount)}</td>
                  </>
                )}
                <td className="text-right whitespace-nowrap font-medium">{fmt(item.lineTotal)}</td>
              </tr>
            ))}
            <tr className="border-b border-black font-semibold [&>td]:border-r [&>td]:border-black [&>td]:p-1 print:[&>td]:p-0.5 [&>td:last-child]:border-r-0">
              <td className="text-right whitespace-nowrap" colSpan={2}>Total</td>
              <td className="text-center">{totalQty}N</td>
              <td className="text-right whitespace-nowrap">{totalGrossWeight.toFixed(3)}</td>
              <td className="text-right whitespace-nowrap">{totalStoneWeight.toFixed(3)}</td>
              <td className="text-right whitespace-nowrap">{totalNetWeight.toFixed(3)}</td>
              <td className="text-right whitespace-nowrap">{fmt(totalGrossPrice)}</td>
              <td className="text-right whitespace-nowrap">
                {fmt(totalMaking)}
                {totalHm > 0 ? <span className="block">HM {fmt(totalHm)}</span> : null}
              </td>
              <td className="text-right whitespace-nowrap">{fmt(totalStoneCharge)}</td>
              <td className="text-right whitespace-nowrap">{fmt(totalSchemeDiscount)}</td>
              {isInterState ? (
                <td className="text-right whitespace-nowrap">{fmt(totalIgst)}</td>
              ) : (
                <>
                  <td className="text-right whitespace-nowrap">{fmt(totalSgst)}</td>
                  <td className="text-right whitespace-nowrap">{fmt(totalCgst)}</td>
                </>
              )}
              <td className="text-right whitespace-nowrap">{fmt(invoice.totalAmount)}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-between border-b border-black p-1 font-medium">
          <span>Total Qty Purchased: {totalQty}N</span>
          <span>Product Total Value: {fmt(invoice.totalAmount)}</span>
        </div>

        {/* Payment details / other charges */}
        <div className="grid grid-cols-2">
          <div className="border-r border-black">
            <p className="border-b border-black p-1 font-semibold">Payment Details</p>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-black [&>th]:p-1 [&>th]:text-left">
                  <th>Payment Mode</th>
                  <th>Doc No</th>
                  <th className="text-right whitespace-nowrap">Amount (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td className="p-1 text-muted-foreground" colSpan={3}>
                      No payments recorded
                    </td>
                  </tr>
                ) : (
                  payments.map((entry) => (
                    <tr key={entry.id} className="[&>td]:p-1">
                      <td>{entry.paymentMethod ? PAYMENT_METHOD_LABELS[entry.paymentMethod] ?? entry.paymentMethod : "-"}</td>
                      <td>{entry.paymentReference || entry.bankName || "-"}</td>
                      <td className="text-right whitespace-nowrap">{fmt(entry.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-black font-semibold [&>td]:p-1">
                  <td colSpan={2}>Total Amount Paid</td>
                  <td className="text-right whitespace-nowrap">{fmt(totalPaid)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div>
            <p className="border-b border-black p-1 font-semibold">Additional Other Charges</p>
            <div className="space-y-1 p-1">
              <div className="flex justify-between">
                <span>Other charges:</span>
                <span>0.00</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Net invoice values</span>
                <span>{fmt(invoice.totalAmount)}</span>
              </div>
              <div className="border-t border-black pt-1">
                <p>Discount Details:</p>
                <div className="flex justify-between">
                  <span>Product/Scheme discount</span>
                  <span>{fmt(totalSchemeDiscount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Invoice-level discount</span>
                  <span>{fmt(invoice.discount - totalSchemeDiscount)}</span>
                </div>
              </div>
              <div className="flex justify-between border-t border-black pt-1 font-semibold">
                <span>Total Amount to be paid</span>
                <span>{fmt(invoice.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-black p-2">
          <p>Value in words :- {amountInWords(invoice.totalAmount)}</p>
        </div>

        {invoice.notes && (
          <div className="border-t border-black p-2">
            <p className="font-semibold">Notes</p>
            <p className="whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        {settings.invoiceTerms && (
          <div className="border-t border-black p-2">
            <p className="font-semibold">Terms & Conditions</p>
            <p className="whitespace-pre-wrap">{settings.invoiceTerms}</p>
          </div>
        )}
      </div>
    </main>
  )
}
