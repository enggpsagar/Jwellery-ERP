import Link from "next/link"
import { ArrowRightCircle } from "lucide-react"

import type { Quotation } from "@/lib/actions/quotation-actions"
import { formatShortDate } from "@/lib/utils"
import { QuotationStatusBadge } from "@/components/quotations/quotation-status-badge"

type QuotationItem = Quotation["items"][number]

type QuotationDetailContentProps = {
  quotation: Quotation
}

/**
 * The body of a quotation's detail view — status/customer summary, line
 * items, totals, notes. Shared between the standalone /quotations/[id]
 * page and the Quotations list's inline detail panel, same convention as
 * InvoiceDetailContent/PurchaseDetailContent, so the two can never drift
 * apart.
 */
export function QuotationDetailContent({ quotation }: QuotationDetailContentProps) {
  // A column with nothing to show across every line item is dead weight,
  // not information — Making also carries the Hallmark charge sub-line, so
  // it stays visible if any item has that even with makingCharge itself 0.
  const showMaking = quotation.items.some(
    (item: QuotationItem) => item.makingCharge > 0 || item.hmCharge > 0,
  )
  const showStone = quotation.items.some((item: QuotationItem) => item.stoneCharge > 0)

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <div className="flex flex-wrap items-center gap-2">
              <QuotationStatusBadge status={quotation.status} />
              {quotation.convertedTo && (
                <Link
                  href={`/billing/${quotation.convertedTo.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  <ArrowRightCircle className="h-3.5 w-3.5" />
                  Converted to Invoice ({quotation.convertedTo.invoiceNumber})
                </Link>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Quotation Date</p>
            <p className="font-medium">{formatShortDate(quotation.quotationDate)}</p>
          </div>

          {quotation.validUntil && (
            <div>
              <p className="text-sm text-muted-foreground">Valid Until</p>
              <p className="font-medium">{formatShortDate(quotation.validUntil)}</p>
            </div>
          )}

          <div>
            <p className="text-sm text-muted-foreground">Party</p>
            <p className="font-medium">
              {quotation.customer?.name}{" "}
              {quotation.customer?.phone ? `(${quotation.customer.phone})` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Item</th>
              <th className="px-4 py-3 text-left font-medium">Qty</th>
              <th className="px-4 py-3 text-left font-medium">Weight</th>
              <th className="px-4 py-3 text-left font-medium">Rate</th>
              {showMaking && <th className="px-4 py-3 text-left font-medium">Making</th>}
              {showStone && <th className="px-4 py-3 text-left font-medium">Stone</th>}
              <th className="px-4 py-3 text-left font-medium">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((item: QuotationItem) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  {item.itemName}
                  {item.stoneMetalTypeName ? (
                    <span className="block text-xs text-muted-foreground">
                      Stone: {item.stoneMetalTypeName}
                      {item.stoneTypeNames ? ` (${item.stoneTypeNames})` : ""}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">
                  {item.purity === "DIAMOND"
                    ? item.caratWeight != null ? `${item.caratWeight.toFixed(3)} ct` : "-"
                    : item.netWeight != null ? `${item.netWeight.toFixed(3)} g` : "-"}
                </td>
                <td className="px-4 py-3">{item.rate ? `₹${item.rate.toFixed(2)}` : "-"}</td>
                {showMaking && (
                  <td className="px-4 py-3">
                    {item.makingCharge > 0 ? `₹${item.makingCharge.toFixed(2)}` : "-"}
                    {(() => {
                      const quantity = item.purity === "DIAMOND" ? item.caratWeight : item.netWeight
                      return item.makingChargeType === "PERCENTAGE" && item.rate && quantity ? (
                        <span className="block text-xs text-muted-foreground">
                          ({((item.makingCharge / (item.rate * quantity)) * 100).toFixed(2)}% of metal value)
                        </span>
                      ) : null
                    })()}
                    {item.hmCharge > 0 ? (
                      <span className="block text-xs text-muted-foreground">
                        HM ₹{item.hmCharge.toFixed(2)}
                      </span>
                    ) : null}
                  </td>
                )}
                {showStone && (
                  <td className="px-4 py-3">
                    {item.stoneCharge > 0 ? `₹${item.stoneCharge.toFixed(2)}` : "-"}
                  </td>
                )}
                <td className="px-4 py-3 font-medium">₹{item.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border bg-card p-6 max-w-sm ml-auto space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>₹{quotation.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Making Charges (incl. HM)</span>
          <span>₹{quotation.makingCharges.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Stone Charges</span>
          <span>₹{quotation.stoneCharges.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Discount</span>
          <span>-₹{quotation.discount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span>₹{quotation.taxAmount.toFixed(2)}</span>
        </div>
        {quotation.roundOffAmount !== 0 && (
          <div className="flex justify-between">
            <span>Round Off</span>
            <span>
              {quotation.roundOffAmount > 0 ? "+" : "-"}₹{Math.abs(quotation.roundOffAmount).toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
          <span>Total</span>
          <span>₹{quotation.totalAmount.toFixed(2)}</span>
        </div>
      </div>

      {quotation.notes && (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">Notes</p>
          <p className="font-medium">{quotation.notes}</p>
        </div>
      )}
    </div>
  )
}
