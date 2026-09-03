import type { Metadata } from "next"

import {
  getKachaInvoiceFormCustomers,
  getKachaInvoiceFormStockItems,
} from "@/lib/actions/kacha-invoice-actions"
import { getStoreLocations } from "@/lib/actions/store-location-actions"

import { KachaInvoiceForm } from "@/components/billing/kacha/kacha-invoice-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

export const metadata: Metadata = {
  title: "New Kacha Invoice",
}

export default async function NewKachaInvoicePage() {
  const [customers, stockItems, locations] = await Promise.all([
    getKachaInvoiceFormCustomers(),
    getKachaInvoiceFormStockItems(),
    getStoreLocations(),
  ])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="New Kacha Slip"
        description="Record an informal sale slip for a customer, without GST."
        backHref="/billing/kacha"
        backLabel="Back to Kacha Slips"
      />

      <KachaInvoiceForm customers={customers} stockItems={stockItems} locations={locations} />
    </main>
  )
}
