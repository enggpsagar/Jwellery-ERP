import type { Metadata } from "next"
import { cache } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { getKachaInvoiceById } from "@/lib/actions/kacha-invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { InvoicePrintButton } from "@/components/billing/invoice-print-button"
import { KachaPrintThermal } from "@/components/billing/kacha/kacha-print-thermal"
import { KachaPrintClassic } from "@/components/billing/kacha/kacha-print-classic"
import { KachaPrintModern } from "@/components/billing/kacha/kacha-print-modern"
import { KachaPrintMinimal } from "@/components/billing/kacha/kacha-print-minimal"
import { KachaPrintElegant } from "@/components/billing/kacha/kacha-print-elegant"

type Props = {
  params: Promise<{ id: string }>
}

const getKachaInvoice = cache(getKachaInvoiceById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const kachaInvoice = await getKachaInvoice(id)
    return { title: kachaInvoice ? `Kacha Slip ${kachaInvoice.slipNumber}` : "Kacha Slip" }
  } catch {
    return { title: "Kacha Slip" }
  }
}

/**
 * Print page for a Kacha Slip — mirrors Invoice's own print page shape
 * (Back/Print header row, then branch on printLayout, then on
 * invoiceTemplate for the A4 case). A Kacha Slip has no GST fields at all,
 * so unlike Invoice's page there's no rate-wise GST summary to compute here
 * — each template component renders straight off the KachaInvoice shape.
 */
export default async function KachaInvoicePrintPage({ params }: Props) {
  const { id } = await params

  const [kachaInvoice, settings] = await Promise.all([getKachaInvoice(id), getBusinessSettings()])

  if (!kachaInvoice) notFound()

  const headerRow = (
    <div className="flex justify-between print:hidden">
      <Link
        href={`/billing/kacha/${kachaInvoice.id}`}
        className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Slip
      </Link>
      <InvoicePrintButton />
    </div>
  )

  // Thermal is a fully separate, narrower layout (own <main>/<style>/@page —
  // see KachaPrintThermal's own doc comment) rather than a variant nested
  // inside the A4 markup below; only the Back/Print header row is
  // duplicated between the two branches — same structure as Invoice's own
  // print page.
  if (settings.printLayout === "THERMAL") {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6 print:p-0">
        {headerRow}
        <KachaPrintThermal kachaInvoice={kachaInvoice} settings={settings} />
      </div>
    )
  }

  const KachaTemplate =
    settings.invoiceTemplate === "MODERN"
      ? KachaPrintModern
      : settings.invoiceTemplate === "MINIMAL"
        ? KachaPrintMinimal
        : settings.invoiceTemplate === "ELEGANT"
          ? KachaPrintElegant
          : KachaPrintClassic

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6 print:p-0">
      {headerRow}
      <KachaTemplate kachaInvoice={kachaInvoice} settings={settings} />
    </div>
  )
}
