import { notFound, redirect } from "next/navigation"

import { getQuotationById } from "@/lib/actions/quotation-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { ConvertToInvoiceForm } from "@/components/quotations/convert-to-invoice-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

type Props = {
  params: Promise<{ id: string }>
}

export default async function ConvertQuotationToInvoicePage({ params }: Props) {
  const { id } = await params

  const [quotation, businessSettings] = await Promise.all([
    getQuotationById(id),
    getBusinessSettings(),
  ])

  if (!quotation) notFound()

  if (quotation.status !== "open") {
    redirect(`/quotations/${id}`)
  }

  const taxableAmount =
    quotation.subtotal + quotation.makingCharges + quotation.stoneCharges - quotation.discount
  const defaultTaxAmount =
    Math.round(((taxableAmount * businessSettings.defaultGstRate) / 100) * 100) / 100

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={`Convert ${quotation.quotationNumber} to Invoice`}
        description="Finalize tax and payment details to issue an invoice for this quotation."
        backHref={`/quotations/${id}`}
        backLabel="Back to Quotation"
      />

      <ConvertToInvoiceForm quotation={quotation} defaultTaxAmount={defaultTaxAmount} />
    </main>
  )
}
