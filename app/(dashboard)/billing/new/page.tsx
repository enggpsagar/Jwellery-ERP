import {
  getInvoiceFormCustomers,
  getInvoiceFormStockItems,
} from "@/lib/actions/invoice-actions"

import { InvoiceForm } from "@/components/billing/invoice-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

export default async function NewInvoicePage() {
  const [customers, stockItems] = await Promise.all([
    getInvoiceFormCustomers(),
    getInvoiceFormStockItems(),
  ])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="New Invoice"
        description="Bill a customer for jewellery items."
        backHref="/billing"
        backLabel="Back to Billing"
      />

      <InvoiceForm customers={customers} stockItems={stockItems} />
    </main>
  )
}
