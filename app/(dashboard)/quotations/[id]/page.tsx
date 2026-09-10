import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"

import { getQuotationById } from "@/lib/actions/quotation-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { QuotationActionsBar } from "@/components/quotations/quotation-actions-bar"
import { QuotationDetailContent } from "@/components/quotations/quotation-detail-content"
import { PageBackHeader } from "@/components/shared/page-back-header"

type Props = {
  params: Promise<{ id: string }>
}

const getQuotation = cache(getQuotationById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const quotation = await getQuotation(id)
    return { title: quotation?.quotationNumber ?? "Quotation" }
  } catch {
    return { title: "Quotation" }
  }
}

export default async function QuotationDetailPage({ params }: Props) {
  const { id } = await params
  const [quotation, businessSettings] = await Promise.all([
    getQuotation(id),
    getBusinessSettings(),
  ])

  if (!quotation) notFound()

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <PageBackHeader
        title={quotation.quotationNumber}
        description={quotation.customer?.name ?? ""}
        backHref="/quotations"
        backLabel="Back to Quotations"
        action={<QuotationActionsBar quotation={quotation} businessName={businessSettings.businessName} />}
      />

      <QuotationDetailContent quotation={quotation} />
    </main>
  )
}
