import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { getQuotationById } from "@/lib/actions/quotation-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { InvoicePrintButton } from "@/components/billing/invoice-print-button"
import { QuotationPrintThermal } from "@/components/quotations/quotation-print-thermal"
import { QuotationPrintClassic } from "@/components/quotations/quotation-print-classic"
import { QuotationPrintModern } from "@/components/quotations/quotation-print-modern"
import { QuotationPrintMinimal } from "@/components/quotations/quotation-print-minimal"
import { QuotationPrintElegant } from "@/components/quotations/quotation-print-elegant"

type Props = {
  params: Promise<{ id: string }>
}

const getQuotation = cache(getQuotationById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const quotation = await getQuotation(id)
    return { title: quotation ? `Quotation ${quotation.quotationNumber}` : "Quotation" }
  } catch {
    return { title: "Quotation" }
  }
}

/**
 * Print page for a Quotation — mirrors /billing/[id]/print's own page-level
 * shape (generateMetadata, cache()-wrapped getter, Back/Print header row,
 * then branch on printLayout then invoiceTemplate), just with no Quotation
 * document existing here before this: this whole file, and every component
 * it renders, is new. InvoicePrintButton is reused as-is (it's generic —
 * just a window.print() trigger with no Invoice-specific text).
 */
export default async function QuotationPrintPage({ params }: Props) {
  const { id } = await params

  const [quotation, settings] = await Promise.all([getQuotation(id), getBusinessSettings()])

  if (!quotation) notFound()

  // Thermal is a fully separate, narrower layout (own <main>/<style>/@page —
  // see QuotationPrintThermal's own doc comment) rather than a variant
  // nested inside the A4 markup below; only the Back/Print header row is
  // duplicated between the two branches.
  if (settings.printLayout === "THERMAL") {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6 print:p-0">
        <div className="flex justify-between print:hidden">
          <Link
            href={`/quotations/${quotation.id}`}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Quotation
          </Link>
          <InvoicePrintButton />
        </div>
        <QuotationPrintThermal quotation={quotation} settings={settings} />
      </div>
    )
  }

  const TemplateComponent =
    settings.invoiceTemplate === "MODERN"
      ? QuotationPrintModern
      : settings.invoiceTemplate === "MINIMAL"
        ? QuotationPrintMinimal
        : settings.invoiceTemplate === "ELEGANT"
          ? QuotationPrintElegant
          : QuotationPrintClassic

  return (
    <div className="space-y-4 p-6 print:p-0">
      <div className="mx-auto flex max-w-3xl justify-between print:hidden">
        <Link
          href={`/quotations/${quotation.id}`}
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Quotation
        </Link>
        <InvoicePrintButton />
      </div>

      <TemplateComponent quotation={quotation} settings={settings} />
    </div>
  )
}
