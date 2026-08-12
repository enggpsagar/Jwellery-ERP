import Link from "next/link"

import { getKachaInvoices } from "@/lib/actions/kacha-invoice-actions"
import { KachaInvoiceTable } from "@/components/billing/kacha/kacha-invoice-table"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"

export default async function KachaBillingPage() {
  const { kachaInvoices } = await getKachaInvoices()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Kacha Slips"
        description="Informal, no-GST sale slips — convert to a Pakka invoice once paperwork is ready."
        backHref="/billing"
        backLabel="Back to Billing"
        action={
          <Link href="/billing/kacha/new">
            <Button>New Kacha Slip</Button>
          </Link>
        }
      />

      <KachaInvoiceTable kachaInvoices={kachaInvoices} />
    </main>
  )
}
