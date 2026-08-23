import {
  getQuotationFormCustomers,
  getQuotationFormStockItems,
} from "@/lib/actions/quotation-actions"

import { QuotationForm } from "@/components/quotations/quotation-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

export default async function NewQuotationPage() {
  const [customers, stockItems] = await Promise.all([
    getQuotationFormCustomers(),
    getQuotationFormStockItems(),
  ])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="New Quotation"
        description="Prepare a price quotation for a customer."
        backHref="/quotations"
        backLabel="Back to Quotations"
      />

      <QuotationForm customers={customers} stockItems={stockItems} />
    </main>
  )
}
