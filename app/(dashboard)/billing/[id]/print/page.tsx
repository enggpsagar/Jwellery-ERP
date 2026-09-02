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

export default async function InvoicePrintPage({ params }: Props) {
  const { id } = await params

  const [invoice, settings, metalRates] = await Promise.all([
    getInvoiceById(id),
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
    <main className="mx-auto max-w-5xl space-y-4 p-6 text-xs text-black print:p-0 print:text-[10px]">
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
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black [&>th]:border-r [&>th]:border-black [&>th]:p-1 [&>th:last-child]:border-r-0">
              <th className="text-left">Variant no/Product description/Fineness</th>
              <th>Purity/HSN</th>
              <th>Net Qty</th>
              <th>Gross Product Weight (grams)</th>
              <th>Net Stone Weight (g)</th>
              <th>Net Metal Weight (grams)</th>
              <th>Gross Product Price (Rs.)</th>
              <th>Making Charges (Rs.)</th>
              <th>Scheme*/Discount (Rs.)</th>
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
              <th>Product Value (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-b border-black [&>td]:border-r [&>td]:border-black [&>td]:p-1 [&>td:last-child]:border-r-0 align-top">
                <td>{item.itemName}</td>
                <td>
                  {item.purity ?? "-"}
                  {item.hsnCode ? <span className="block">{item.hsnCode}</span> : null}
                </td>
                <td className="text-center">{item.quantity}N</td>
                <td className="text-right">{(item.grossWeight ?? 0).toFixed(3)}</td>
                <td className="text-right">{(item.stoneWeight ?? 0).toFixed(3)}</td>
                <td className="text-right">{(item.netWeight ?? 0).toFixed(3)}</td>
                <td className="text-right">{fmt((item.rate ?? 0) * (item.netWeight ?? 0))}</td>
                <td className="text-right">
                  {fmt(item.makingCharge)}
                  {item.hmCharge > 0 ? <span className="block">HM {fmt(item.hmCharge)}</span> : null}
                </td>
                <td className="text-right">{fmt(item.schemeDiscount)}</td>
                {isInterState ? (
                  <td className="text-right">{fmt(item.igstAmount)}</td>
                ) : (
                  <>
                    <td className="text-right">{fmt(item.sgstAmount)}</td>
                    <td className="text-right">{fmt(item.cgstAmount)}</td>
                  </>
                )}
                <td className="text-right font-medium">{fmt(item.lineTotal)}</td>
              </tr>
            ))}
            <tr className="border-b border-black font-semibold [&>td]:border-r [&>td]:border-black [&>td]:p-1 [&>td:last-child]:border-r-0">
              <td className="text-right" colSpan={2}>Total</td>
              <td className="text-center">{totalQty}N</td>
              <td className="text-right">{totalGrossWeight.toFixed(3)}</td>
              <td className="text-right">{totalStoneWeight.toFixed(3)}</td>
              <td className="text-right">{totalNetWeight.toFixed(3)}</td>
              <td className="text-right">{fmt(totalGrossPrice)}</td>
              <td className="text-right">
                {fmt(totalMaking)}
                {totalHm > 0 ? <span className="block">HM {fmt(totalHm)}</span> : null}
              </td>
              <td className="text-right">{fmt(totalSchemeDiscount)}</td>
              {isInterState ? (
                <td className="text-right">{fmt(totalIgst)}</td>
              ) : (
                <>
                  <td className="text-right">{fmt(totalSgst)}</td>
                  <td className="text-right">{fmt(totalCgst)}</td>
                </>
              )}
              <td className="text-right">{fmt(invoice.totalAmount)}</td>
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
                  <th className="text-right">Amount (Rs.)</th>
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
                      <td className="text-right">{fmt(entry.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-black font-semibold [&>td]:p-1">
                  <td colSpan={2}>Total Amount Paid</td>
                  <td className="text-right">{fmt(totalPaid)}</td>
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
      </div>
    </main>
  )
}
