import Link from "next/link"

import type { Purchase, PurchaseItemComponent } from "@/lib/actions/purchase-actions"
import { formatShortDate } from "@/lib/utils"
import { WeightText } from "@/components/shared/weight-text"
import { PurchaseStatusBadge } from "@/components/purchases/purchase-status-badge"

const rupees = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  NET_BANKING: "Net Banking",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
}

/**
 * The body of a purchase's detail view — status/vendor summary, line
 * items, totals, notes. Shared between the standalone /purchases/[id]
 * page (deep-linked from reports, the vendor ledger, etc.) and the inline
 * detail pane on the Purchases list itself, so the two can never drift
 * apart — same convention as CustomerDetailContent.
 */
export function PurchaseDetailContent({
  purchase,
}: {
  purchase: Purchase
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <PurchaseStatusBadge status={purchase.status} />
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Purchase Date</p>
            <p className="font-medium">
              {formatShortDate(purchase.purchaseDate)}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Supplier</p>
            {purchase.vendor ? (
              <Link
                href={`/customers/${purchase.vendor.id}?from=${encodeURIComponent(`/purchases/${purchase.id}`)}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {purchase.vendor.name}
                {purchase.vendor.phone ? ` (${purchase.vendor.phone})` : ""}
              </Link>
            ) : (
              <p className="font-medium">—</p>
            )}
          </div>

          {purchase.vendorInvoiceNumber && (
            <div>
              <p className="text-sm text-muted-foreground">Supplier Invoice Number</p>
              <p className="font-medium">{purchase.vendorInvoiceNumber}</p>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Item</th>
              <th className="px-4 py-3 text-left font-medium">Qty</th>
              <th className="px-4 py-3 text-left font-medium">Purity</th>
              <th className="px-4 py-3 text-left font-medium">Weight</th>
              <th className="px-4 py-3 text-left font-medium">Rate</th>
              <th className="px-4 py-3 text-left font-medium">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {purchase.items.map((item: (typeof purchase.items)[number]) => {
              // One piece of several metals/stones — its rows carry the
              // real purities, weights and rates; the line's own Purity/
              // Rate are only a summary (first metal / none).
              const multiPart = item.components.length > 0
              // No metal weight but a carat/stone weight: a loose stone.
              const isStoneLine =
                item.purity === "DIAMOND" ||
                (!(Number(item.netWeight) > 0) &&
                  (Number(item.caratWeight) > 0 || Number(item.stoneWeight) > 0))
              return (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  {item.itemName}
                  {multiPart ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground" data-testid="purchase-item-components">
                      {item.components.map((component: PurchaseItemComponent, index: number) => (
                        <li key={index}>
                          {component.kind === "METAL" ? (
                            <>
                              <span className="font-medium text-foreground">
                                {[component.metalName ?? "Metal", component.purityLabel ?? component.purity].filter(Boolean).join(" ")}
                              </span>
                              {" · "}
                              <WeightText value={component.netWeight ?? 0} /> net
                              {component.fineWeight != null && component.fineWeight !== component.netWeight ? (
                                <> · <WeightText value={component.fineWeight} /> pure</>
                              ) : (
                                ""
                              )}
                            </>
                          ) : (
                            <>
                              <span className="font-medium text-foreground">
                                {component.stoneMetalTypeName ?? "Stone"}
                                {component.stoneTypeNames ? ` (${component.stoneTypeNames})` : ""}
                              </span>
                              {" · "}
                              <WeightText value={component.caratWeight ?? 0} stone />
                            </>
                          )}
                          {" · "}
                          {rupees(component.amount)}
                          {item.quantity > 1 ? " / piece" : ""}
                          {component.gstRatePercent != null ? ` · GST ${component.gstRatePercent}%` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : item.stoneMetalTypeName ? (
                    <span className="block text-xs text-muted-foreground">
                      Stone: {item.stoneMetalTypeName}
                      {item.stoneTypeNames ? ` (${item.stoneTypeNames})` : ""}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">{multiPart ? "Mixed" : item.purity ?? "-"}</td>
                <td className="px-4 py-3">
                  {multiPart ? (
                    <WeightText value={item.netWeight} fallback="-" />
                  ) : isStoneLine ? (
                    // A loose-stone line (diamond, moissanite, any gemstone
                    // metal type) keeps its weight in carats + stone grams;
                    // netWeight is 0 by design, so showing it read "0 g".
                    // stoneWeight isn't shown as grams: for a stone metal whose
                    // primary unit is carat it holds the carat figure too
                    // (S-X-001: stoneWeight 20.5 = caratWeight 20.5).
                    <WeightText value={item.caratWeight} unit="CARAT" fallback="-" />
                  ) : (
                    <WeightText value={item.netWeight} fallback="-" />
                  )}
                </td>
                <td className="px-4 py-3">
                  {multiPart
                    ? "Mixed"
                    : item.rate
                      ? `₹${item.rate.toFixed(2)}`
                      : isStoneLine && item.stoneRate
                        ? `₹${item.stoneRate.toFixed(2)} / ct`
                        : "-"}
                </td>
                <td className="px-4 py-3 font-medium">₹{item.lineTotal.toFixed(2)}</td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="ml-auto max-w-sm space-y-1 rounded-xl border bg-card p-6 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>₹{purchase.subtotal.toFixed(2)}</span>
        </div>
        {purchase.makingCharges !== 0 && (
          <div className="flex justify-between">
            <span>Making Charges</span>
            <span>₹{purchase.makingCharges.toFixed(2)}</span>
          </div>
        )}
        {purchase.stoneCharges !== 0 && (
          <div className="flex justify-between">
            <span>Stone Charges</span>
            <span>₹{purchase.stoneCharges.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Discount</span>
          <span>-₹{purchase.discount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>GST (SGST+CGST or IGST)</span>
          <span>₹{purchase.taxAmount.toFixed(2)}</span>
        </div>
        {purchase.roundOffAmount !== 0 && (
          <div className="flex justify-between">
            <span>Round Off</span>
            <span>
              {purchase.roundOffAmount >= 0 ? "+" : "-"}₹
              {Math.abs(purchase.roundOffAmount).toFixed(2)}
            </span>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
          <span>Total</span>
          <span>₹{purchase.totalAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-medium text-blue-600">
          <span>Paid</span>
          <span>₹{purchase.paidAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-medium text-red-600">
          <span>Balance</span>
          <span>₹{purchase.balanceAmount.toFixed(2)}</span>
        </div>
      </div>

      {purchase.payments.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <p className="font-medium">Payment History</p>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b">
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Method</th>
                <th className="px-4 py-3 text-left font-medium">Reference</th>
                <th className="px-4 py-3 text-right font-medium">Amount Paid</th>
                <th className="px-4 py-3 text-right font-medium">Balance After</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // purchase.payments is entryDate-desc (latest first). The
                // balance right after the latest payment is today's
                // balanceAmount; each older row's balance-after is that plus
                // everything paid more recently — walk forward accumulating
                // the more-recent amounts already seen.
                let paidSinceThisRow = 0
                return purchase.payments.map((payment: (typeof purchase.payments)[number]) => {
                  const balanceAfter = purchase.balanceAmount + paidSinceThisRow
                  paidSinceThisRow += payment.amount
                  return (
                    <tr key={payment.id} className="border-b last:border-0">
                      <td className="px-4 py-3">{formatShortDate(payment.entryDate)}</td>
                      <td className="px-4 py-3">
                        {payment.paymentMethod
                          ? PAYMENT_METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod
                          : "-"}
                      </td>
                      <td className="px-4 py-3">{payment.paymentReference ?? "-"}</td>
                      <td className="px-4 py-3 text-right font-medium text-blue-600">
                        ₹{payment.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">₹{balanceAfter.toFixed(2)}</td>
                    </tr>
                  )
                })
              })()}
            </tbody>
          </table>
        </div>
      )}

      {purchase.notes && (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">Notes</p>
          <p className="font-medium">{purchase.notes}</p>
        </div>
      )}
    </div>
  )
}
