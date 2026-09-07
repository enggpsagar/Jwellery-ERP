"use client"

import Link from "next/link"

import type { Quotation } from "@/lib/actions/quotation-actions"
import { formatShortDate } from "@/lib/utils"
import { ShareWhatsAppButton } from "@/components/billing/share-whatsapp-button"
import { DeleteQuotationButton } from "@/components/quotations/delete-quotation-button"
import { Button } from "@/components/ui/button"

type QuotationActionsBarProps = {
  quotation: Quotation
  businessName: string
}

/**
 * Every action available on a quotation — WhatsApp share, Delete, Convert
 * to Invoice. Shared between the standalone /quotations/[id] page and the
 * Quotations list's inline detail panel so the two can never drift apart,
 * same convention as InvoiceActionsBar/PurchaseRowActions.
 *
 * Delete and Convert only ever show for an "open" quotation — once
 * converted, the quotation itself is a closed record; the invoice it
 * became is where further action happens.
 */
export function QuotationActionsBar({ quotation, businessName }: QuotationActionsBarProps) {
  const whatsappMessage = [
    businessName,
    `Quotation ${quotation.quotationNumber}`,
    `Date: ${formatShortDate(quotation.quotationDate)}`,
    quotation.validUntil ? `Valid until: ${formatShortDate(quotation.validUntil)}` : null,
    `Total: ₹${quotation.totalAmount.toFixed(2)}`,
  ]
    .filter(Boolean)
    .join("\n")

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ShareWhatsAppButton phone={quotation.customer?.phone} message={whatsappMessage} />
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
  )
}
