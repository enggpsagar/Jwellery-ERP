import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"

import { getInvoiceById } from "@/lib/actions/invoice-actions"
import { getCreditNotesForInvoice } from "@/lib/actions/credit-note-actions"
import { getStoreLocations } from "@/lib/actions/store-location-actions"
import { resolveBackLink } from "@/lib/safe-return-to"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { toTitleCase } from "@/lib/utils"
import { InvoiceActionsBar } from "@/components/billing/invoice-actions-bar"
import { InvoiceDetailContent } from "@/components/billing/invoice-detail-content"
import { PageBackHeader } from "@/components/shared/page-back-header"

type Props = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ from?: string }>
}

// Shared with generateMetadata below so the invoice is only fetched once
// per request rather than once for the tab title and again for the page.
const getInvoice = cache(getInvoiceById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const invoice = await getInvoice(id)
    return { title: invoice ? `Invoice ${invoice.invoiceNumber}` : "Invoice" }
  } catch {
    return { title: "Invoice" }
  }
}

export default async function InvoiceDetailPage({ params, searchParams }: Props) {
  const { id } = await params

  // Invoices are opened from the billing list, the ledger and Reports, so
  // "back" follows whoever linked here.
  const backTo = resolveBackLink((await searchParams)?.from, {
    href: "/billing",
    label: "Back to Billing",
  })
  const [invoice, settings, locations] = await Promise.all([
    getInvoice(id),
    getBusinessSettings(),
    getStoreLocations(),
  ])

  if (!invoice) notFound()

  const creditNotes = await getCreditNotesForInvoice(invoice.id)

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <PageBackHeader
        title={invoice.invoiceNumber}
        description={invoice.customer?.name ? toTitleCase(invoice.customer.name) : ""}
        backHref={backTo.href}
        backLabel={backTo.label}
        action={
          <InvoiceActionsBar
            invoice={invoice}
            locations={locations}
            businessName={settings.businessName}
            returnWindowDays={settings.returnWindowDays}
          />
        }
      />

      <InvoiceDetailContent
        invoice={invoice}
        creditNotes={creditNotes}
        returnWindowDays={settings.returnWindowDays}
      />
    </main>
  )
}
