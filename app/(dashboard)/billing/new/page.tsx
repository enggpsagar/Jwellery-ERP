import type { Metadata } from "next"

import {
  getInvoiceFormCustomers,
  getInvoiceFormStockItems,
} from "@/lib/actions/invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getStoreLocations } from "@/lib/actions/store-location-actions"
import { getStoreMetals, getAllStoreMetalOrigins } from "@/lib/actions/taxonomy-actions"

import { InvoiceForm } from "@/components/billing/invoice-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

export const metadata: Metadata = {
  title: "New Invoice",
}

export default async function NewInvoicePage() {
  const [customers, stockItems, businessSettings, locations, metals, origins] = await Promise.all([
    getInvoiceFormCustomers(),
    getInvoiceFormStockItems(),
    getBusinessSettings(),
    getStoreLocations(),
    getStoreMetals(),
    getAllStoreMetalOrigins(),
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
        locations={locations}
        metals={metals}
        origins={origins}
        defaultGstRate={businessSettings.defaultGstRate}
        gstScheme={businessSettings.gstScheme}
        storeState={businessSettings.state}
        defaultNotes={businessSettings.invoiceNotes || undefined}
      />
    </main>
  )
}
