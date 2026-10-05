import type { Metadata } from "next"
import { cache } from "react"
import { notFound, redirect } from "next/navigation"

import { getKachaInvoiceById } from "@/lib/actions/kacha-invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getGstRates } from "@/lib/actions/gst-rate-actions"
import { getCustomerById } from "@/lib/actions/customer-actions"
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
        ? `Convert Estimate ${kachaInvoice.slipNumber}`
        : "Convert Estimate",
    }
  } catch {
    return { title: "Convert Estimate" }
  }
}

export default async function ConvertKachaToPakkaPage({ params }: Props) {
  const { id } = await params

  const [kachaInvoice, businessSettings, gstRates] = await Promise.all([
    getKachaInvoice(id),
    getBusinessSettings(),
    getGstRates(),
  ])

  if (!kachaInvoice) notFound()

  // Already converted (including the refresh right after converting here):
  // go to the Tax Invoice it became.
  if (kachaInvoice.convertedToId) {
    redirect(`/billing/${kachaInvoice.convertedToId}`)
  }

  // getKachaInvoiceById's customer select has no state, and the tax preview
  // needs it for the same SGST+CGST vs IGST split convertKachaToPakka uses.
  const customer = kachaInvoice.customer ? await getCustomerById(kachaInvoice.customer.id) : null

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={`Convert ${kachaInvoice.slipNumber} to Tax Invoice`}
        description="Add GST details to issue a formal tax invoice for this sale."
        backHref={`/billing/kacha/${id}`}
        backLabel="Back to Estimate"
      />

      <ConvertToPakkaForm
        kachaInvoice={kachaInvoice}
        gstRates={gstRates}
        defaultGstRate={businessSettings.defaultGstRate}
        showDueDate={businessSettings.showDueDate}
        gstScheme={businessSettings.gstScheme}
        storeState={businessSettings.state || null}
        customerState={customer?.state || null}
      />
    </main>
  )
}
