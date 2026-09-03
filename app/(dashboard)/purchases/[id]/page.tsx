import type { Metadata } from "next"
import { cache } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getPurchaseById } from "@/lib/actions/purchase-actions"
import { PurchaseStatusBadge } from "@/components/purchases/purchase-status-badge"
import { RecordPurchasePaymentDialog } from "@/components/purchases/record-purchase-payment-dialog"
import { PageBackHeader } from "@/components/shared/page-back-header"

type Props = {
  params: Promise<{ id: string }>
}

const getPurchase = cache(getPurchaseById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const purchase = await getPurchase(id)
    return { title: purchase?.purchaseNumber ?? "Purchase" }
  } catch {
    return { title: "Purchase" }
  }
}

export default async function PurchaseDetailPage({ params }: Props) {
  const { id } = await params
  const purchase = await getPurchase(id)

  if (!purchase) notFound()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={purchase.purchaseNumber}
        description={purchase.vendor?.name ?? ""}
        backHref="/purchases"
        backLabel="Back to Purchases"
        action={
          <RecordPurchasePaymentDialog
            purchaseId={purchase.id}
            balanceAmount={purchase.balanceAmount}
          />
        }
      />

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <PurchaseStatusBadge status={purchase.status} />
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Purchase Date</p>
            <p className="font-medium">
              {new Date(purchase.purchaseDate).toLocaleDateString("en-IN")}
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

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Item</th>
              <th className="px-4 py-3 text-left font-medium">Qty</th>
              <th className="px-4 py-3 text-left font-medium">Purity</th>
              <th className="px-4 py-3 text-left font-medium">Weight</th>
              <th className="px-4 py-3 text-left font-medium">Rate</th>
              <th className="px-4 py-3 text-left font-medium">Making</th>
              <th className="px-4 py-3 text-left font-medium">Stone</th>
              <th className="px-4 py-3 text-left font-medium">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {purchase.items.map((item: (typeof purchase.items)[number]) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-4 py-3">{item.itemName}</td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">{item.purity ?? "-"}</td>
                <td className="px-4 py-3">
                  {item.purity === "DIAMOND"
                    ? item.caratWeight != null ? `${item.caratWeight.toFixed(3)} ct` : "-"
                    : item.netWeight != null ? `${item.netWeight.toFixed(3)} g` : "-"}
                </td>
                <td className="px-4 py-3">{item.rate ? `₹${item.rate.toFixed(2)}` : "-"}</td>
                <td className="px-4 py-3">₹{item.makingCharge.toFixed(2)}</td>
                <td className="px-4 py-3">₹{item.stoneCharge.toFixed(2)}</td>
                <td className="px-4 py-3 font-medium">₹{item.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border bg-card p-6 max-w-sm ml-auto space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>₹{purchase.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Making Charges</span>
          <span>₹{purchase.makingCharges.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Stone Charges</span>
          <span>₹{purchase.stoneCharges.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Discount</span>
          <span>-₹{purchase.discount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span>₹{purchase.taxAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
          <span>Total</span>
          <span>₹{purchase.totalAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Paid</span>
          <span>₹{purchase.paidAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-red-600 font-medium">
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
    </main>
  )
}
