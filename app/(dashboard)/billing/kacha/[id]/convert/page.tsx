import type { Metadata } from "next"
import { cache } from "react"
import { notFound, redirect } from "next/navigation"

import { getKachaInvoiceById } from "@/lib/actions/kacha-invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { ConvertToPakkaForm } from "@/components/billing/kacha/convert-to-pakka-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

type Props = {
  params: Promise<{ id: string }>
}

const getKachaInvoice = cache(getKachaInvoiceById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const kachaInvoice = await getKachaInvoice(id)
    return {
      title: kachaInvoice
        ? `Convert Kacha Invoice ${kachaInvoice.slipNumber}`
        : "Convert Kacha Invoice",
    }
  } catch {
    return { title: "Convert Kacha Invoice" }
  }
}

export default async function ConvertKachaToPakkaPage({ params }: Props) {
  const { id } = await params

  const [kachaInvoice, businessSettings] = await Promise.all([
    getKachaInvoice(id),
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
