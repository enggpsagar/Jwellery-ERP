import {
  getInvoiceFormCustomers,
  getInvoiceFormStockItems,
} from "@/lib/actions/invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"

import { InvoiceForm } from "@/components/billing/invoice-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

export default async function NewInvoicePage() {
  const [customers, stockItems, businessSettings] = await Promise.all([
    getInvoiceFormCustomers(),
    getInvoiceFormStockItems(),
    getBusinessSettings(),
  ])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="New Invoice"
        description="Bill a customer for jewellery items."
        backHref="/billing"
        backLabel="Back to Billing"
      />

      <InvoiceForm
        customers={customers}
        stockItems={stockItems}
        defaultGstRate={businessSettings.defaultGstRate}
      />
    </main>
  )
}
