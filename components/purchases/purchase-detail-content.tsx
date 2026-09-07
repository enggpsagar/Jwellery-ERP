import Link from "next/link"

import type { Purchase } from "@/lib/actions/purchase-actions"
import { formatShortDate } from "@/lib/utils"
import { PurchaseStatusBadge } from "@/components/purchases/purchase-status-badge"

/**
 * The body of a purchase's detail view — status/vendor summary, line
 * items, totals, notes. Shared between the standalone /purchases/[id]
 * page (deep-linked from reports, the vendor ledger, etc.) and the inline
 * detail pane on the Purchases list itself, so the two can never drift
 * apart — same convention as CustomerDetailContent.
 */
export function PurchaseDetailContent({ purchase }: { purchase: Purchase }) {
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
            <p className="text-sm text-muted-foreground">Vendor</p>
            {purchase.vendor ? (
              <Link
                href={`/vendors/${purchase.vendor.id}?from=${encodeURIComponent(`/purchases/${purchase.id}`)}`}
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
              <p className="text-sm text-muted-foreground">Vendor Invoice Number</p>
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
            {purchase.items.map((item: (typeof purchase.items)[number]) => (
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
                <td className="px-4 py-3">{item.purity ?? "-"}</td>
                <td className="px-4 py-3">
                  {item.purity === "DIAMOND"
                    ? item.caratWeight != null ? `${item.caratWeight.toFixed(3)} ct` : "-"
                    : item.netWeight != null ? `${item.netWeight.toFixed(3)} g` : "-"}
                </td>
                <td className="px-4 py-3">{item.rate ? `₹${item.rate.toFixed(2)}` : "-"}</td>
                <td className="px-4 py-3 font-medium">₹{item.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto max-w-sm space-y-1 rounded-xl border bg-card p-6 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>₹{purchase.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Discount</span>
          <span>-₹{purchase.discount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>GST (SGST+CGST or IGST)</span>
          <span>₹{purchase.taxAmount.toFixed(2)}</span>
        </div>
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

      {purchase.notes && (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">Notes</p>
          <p className="font-medium">{purchase.notes}</p>
        </div>
      )}
    </div>
  )
}
