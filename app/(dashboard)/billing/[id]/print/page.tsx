import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { getInvoiceById } from "@/lib/actions/invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { InvoicePrintButton } from "@/components/billing/invoice-print-button"
import { InvoicePrintThermal } from "@/components/billing/invoice-print-thermal"
import { InvoicePrintClassic } from "@/components/billing/invoice-print-classic"
import { InvoicePrintModern } from "@/components/billing/invoice-print-modern"
import { InvoicePrintMinimal } from "@/components/billing/invoice-print-minimal"
import { InvoicePrintElegant } from "@/components/billing/invoice-print-elegant"

type Props = {
  params: Promise<{ id: string }>
}

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

export default async function InvoicePrintPage({ params }: Props) {
  const { id } = await params

  const [invoice, settings] = await Promise.all([getInvoice(id), getBusinessSettings()])

  if (!invoice) notFound()

  // Thermal is a fully separate, narrower layout (own <main>/<style>/@page —
  // see InvoicePrintThermal's own doc comment) rather than a variant nested
  // inside the A4 markup below; only the Back/Print header row is
  // duplicated between the two branches.
  if (settings.printLayout === "THERMAL") {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6 print:p-0">
        <div className="flex justify-between print:hidden">
          <Link
            href={`/billing/${invoice.id}`}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Invoice
          </Link>
          <InvoicePrintButton />
        </div>
        <InvoicePrintThermal invoice={invoice} settings={settings} />
      </div>
    )
  }

  // A4 has four store-selectable templates (BusinessSettings.invoiceTemplate)
  // — each is a fully self-contained component (own <main>/<style>/@page,
  // own copies of the small print-formatting helpers), same "separate
  // top-level component per format" pattern as the Thermal branch above.
  // Only the Back/Print header row is shared across all of them.
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6 print:p-0">
      <div className="flex justify-between print:hidden">
        <Link
          href={`/billing/${invoice.id}`}
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Invoice
        </Link>
        <InvoicePrintButton />
      </div>
      {settings.invoiceTemplate === "MODERN" ? (
        <InvoicePrintModern invoice={invoice} settings={settings} />
      ) : settings.invoiceTemplate === "MINIMAL" ? (
        <InvoicePrintMinimal invoice={invoice} settings={settings} />
      ) : settings.invoiceTemplate === "ELEGANT" ? (
        <InvoicePrintElegant invoice={invoice} settings={settings} />
      ) : (
        <InvoicePrintClassic invoice={invoice} settings={settings} />
      )}
    </div>
  )
}
