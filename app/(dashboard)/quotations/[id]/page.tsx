import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRightCircle } from "lucide-react"

import { getQuotationById } from "@/lib/actions/quotation-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { QuotationStatusBadge } from "@/components/quotations/quotation-status-badge"
import { DeleteQuotationButton } from "@/components/quotations/delete-quotation-button"
import { ShareWhatsAppButton } from "@/components/billing/share-whatsapp-button"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"

type QuotationItemRow = {
  id: string
  itemName: string
  quantity: number
  purity?: string | null
  netWeight: number | null
  caratWeight?: number | null
  rate: number | null
  makingCharge: number
  makingChargeType?: string
  stoneCharge: number
  lineTotal: number
}

type Props = {
  params: Promise<{ id: string }>
}

export default async function QuotationDetailPage({ params }: Props) {
  const { id } = await params
  const [quotation, businessSettings] = await Promise.all([
    getQuotationById(id),
    getBusinessSettings(),
  ])

  if (!quotation) notFound()

  const whatsappMessage = [
    businessSettings.businessName,
    `Quotation ${quotation.quotationNumber}`,
    `Date: ${new Date(quotation.quotationDate).toLocaleDateString("en-IN")}`,
    quotation.validUntil
      ? `Valid until: ${new Date(quotation.validUntil).toLocaleDateString("en-IN")}`
      : null,
    `Total: ₹${quotation.totalAmount.toFixed(2)}`,
  ]
    .filter(Boolean)
    .join("\n")

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={quotation.quotationNumber}
        description={quotation.customer?.name ?? ""}
        backHref="/quotations"
        backLabel="Back to Quotations"
        action={
          <div className="flex items-center gap-2">
            <ShareWhatsAppButton
              phone={quotation.customer?.phone}
              message={whatsappMessage}
            />
            {quotation.status === "open" ? (
              <>
                <DeleteQuotationButton
                  quotationId={quotation.id}
                  quotationNumber={quotation.quotationNumber}
                />
                <Link href={`/quotations/${quotation.id}/convert`}>
                  <Button>Convert to Invoice</Button>
                </Link>
              </>
            ) : null}
          </div>
        }
      />

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
            <p className="font-medium">
              {new Date(quotation.quotationDate).toLocaleDateString("en-IN")}
            </p>
          </div>

          {quotation.validUntil && (
            <div>
              <p className="text-sm text-muted-foreground">Valid Until</p>
              <p className="font-medium">
                {new Date(quotation.validUntil).toLocaleDateString("en-IN")}
              </p>
            </div>
          )}

          <div>
            <p className="text-sm text-muted-foreground">Customer</p>
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
              <th className="px-4 py-3 text-left font-medium">Making</th>
              <th className="px-4 py-3 text-left font-medium">Stone</th>
              <th className="px-4 py-3 text-left font-medium">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((item: QuotationItemRow) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-4 py-3">{item.itemName}</td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">
                  {item.purity === "DIAMOND"
                    ? item.caratWeight != null ? `${item.caratWeight.toFixed(3)} ct` : "-"
                    : item.netWeight != null ? `${item.netWeight.toFixed(3)} g` : "-"}
                </td>
                <td className="px-4 py-3">{item.rate ? `₹${item.rate.toFixed(2)}` : "-"}</td>
                <td className="px-4 py-3">
                  ₹{item.makingCharge.toFixed(2)}
                  {(() => {
                    const quantity = item.purity === "DIAMOND" ? item.caratWeight : item.netWeight
                    return item.makingChargeType === "PERCENTAGE" && item.rate && quantity ? (
                      <span className="block text-xs text-muted-foreground">
                        ({((item.makingCharge / (item.rate * quantity)) * 100).toFixed(2)}% of metal value)
                      </span>
                    ) : null
                  })()}
                </td>
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
          <span>₹{quotation.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Making Charges</span>
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
    </main>
  )
}
