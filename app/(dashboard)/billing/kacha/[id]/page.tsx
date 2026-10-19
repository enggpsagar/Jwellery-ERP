import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"

import { getKachaInvoiceById } from "@/lib/actions/kacha-invoice-actions"
import { getKachaOldGoldExchange } from "@/lib/actions/old-gold-actions"
import {
  KachaDetailActions,
  KachaDetailContent,
} from "@/components/billing/kacha/kacha-detail-content"
import { PageBackHeader } from "@/components/shared/page-back-header"

type Props = {
  params: Promise<{ id: string }>
}

const getKachaInvoice = cache(getKachaInvoiceById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const kachaInvoice = await getKachaInvoice(id)
    return { title: kachaInvoice ? `Estimate ${kachaInvoice.slipNumber}` : "Estimate" }
  } catch {
    return { title: "Estimate" }
  }
}

export default async function KachaInvoiceDetailPage({ params }: Props) {
  const { id } = await params
  const kachaInvoice = await getKachaInvoice(id)

  if (!kachaInvoice) notFound()

  // Customer Exchange traded in against this slip, if any.
  const oldGoldExchange = await getKachaOldGoldExchange(kachaInvoice.id)

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={kachaInvoice.slipNumber}
        description={kachaInvoice.customer?.name ?? ""}
        backHref="/billing/kacha"
        backLabel="Back to Estimates"
        action={<KachaDetailActions kachaInvoice={kachaInvoice} />}
      />

      <KachaDetailContent kachaInvoice={kachaInvoice} oldGoldExchange={oldGoldExchange} />
    </main>
  )
}
