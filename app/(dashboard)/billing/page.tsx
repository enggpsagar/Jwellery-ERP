import Link from "next/link"

import { getInvoices } from "@/lib/actions/invoice-actions"
import { InvoiceTable } from "@/components/billing/invoice-table"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"

export default async function BillingPage() {
  const { invoices } = await getInvoices()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Billing"
        description="Create and track customer invoices."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        action={
          <div className="flex items-center gap-2">
            <Link href="/billing/kacha">
              <Button variant="outline">Kacha Slips</Button>
            </Link>

            <Link href="/billing/new">
              <Button>New Invoice</Button>
            </Link>
          </div>
        }
      />

      <InvoiceTable invoices={invoices} />
    </main>
  )
}
