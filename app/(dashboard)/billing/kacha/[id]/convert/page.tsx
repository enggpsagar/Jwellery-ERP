import { notFound, redirect } from "next/navigation"

import { getKachaInvoiceById } from "@/lib/actions/kacha-invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { ConvertToPakkaForm } from "@/components/billing/kacha/convert-to-pakka-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

type Props = {
  params: Promise<{ id: string }>
}

export default async function ConvertKachaToPakkaPage({ params }: Props) {
  const { id } = await params

  const [kachaInvoice, businessSettings] = await Promise.all([
    getKachaInvoiceById(id),
    getBusinessSettings(),
  ])

  if (!kachaInvoice) notFound()

  if (kachaInvoice.convertedToId) {
    redirect(`/billing/kacha/${id}`)
  }

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={`Convert ${kachaInvoice.slipNumber} to Pakka`}
        description="Add GST details to issue a formal tax invoice for this sale."
        backHref={`/billing/kacha/${id}`}
        backLabel="Back to Kacha Slip"
      />

      <ConvertToPakkaForm
        kachaInvoice={kachaInvoice}
        defaultGstRate={businessSettings.defaultGstRate}
      />
    </main>
  )
}
