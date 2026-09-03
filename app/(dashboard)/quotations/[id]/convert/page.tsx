import type { Metadata } from "next"
import { cache } from "react"
import { notFound, redirect } from "next/navigation"

import { getQuotationById } from "@/lib/actions/quotation-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { ConvertToInvoiceForm } from "@/components/quotations/convert-to-invoice-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

type Props = {
  params: Promise<{ id: string }>
}

const getQuotation = cache(getQuotationById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const quotation = await getQuotation(id)
    return {
      title: quotation
        ? `Convert Quotation ${quotation.quotationNumber}`
        : "Convert Quotation",
    }
  } catch {
    return { title: "Convert Quotation" }
  }
}

export default async function ConvertQuotationToInvoicePage({ params }: Props) {
  const { id } = await params

  const [quotation, businessSettings] = await Promise.all([
    getQuotation(id),
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
