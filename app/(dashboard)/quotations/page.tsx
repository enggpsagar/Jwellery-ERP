import Link from "next/link"

import { getQuotations } from "@/lib/actions/quotation-actions"
import { QuotationTable } from "@/components/quotations/quotation-table"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Button } from "@/components/ui/button"

export default async function QuotationsPage() {
  const { quotations } = await getQuotations()

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Quotations"
        description="Create and track price quotations for customers."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        action={
          <Link href="/quotations/new">
            <Button>New Quotation</Button>
          </Link>
        }
      />

      <QuotationTable quotations={quotations} />
    </main>
  )
}
