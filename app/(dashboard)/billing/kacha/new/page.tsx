import type { Metadata } from "next"

import {
  getKachaInvoiceFormCustomers,
  getKachaInvoiceFormStockItems,
} from "@/lib/actions/kacha-invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getStoreLocations } from "@/lib/actions/store-location-actions"
import { getStoreMetals, getAllStoreMetalOrigins } from "@/lib/actions/taxonomy-actions"
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions"

import { KachaInvoiceForm } from "@/components/billing/kacha/kacha-invoice-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

export const metadata: Metadata = {
  title: "New Kacha Invoice",
}

export default async function NewKachaInvoicePage() {
  const [customers, stockItems, locations, businessSettings, metals, origins, caratConversionRates] =
    await Promise.all([
      getKachaInvoiceFormCustomers(),
      getKachaInvoiceFormStockItems(),
      getStoreLocations(),
      getBusinessSettings(),
      getStoreMetals(),
      getAllStoreMetalOrigins(),
      getCaratConversionRateMap(),
    ])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="New Kacha Slip"
        description="Record an informal sale slip for a customer, without GST."
        backHref="/billing/kacha"
        backLabel="Back to Kacha Slips"
      />

      <KachaInvoiceForm
        customers={customers}
        stockItems={stockItems}
        locations={locations}
        metals={metals}
        origins={origins}
        caratConversionRates={caratConversionRates}
        hallmarkChargePerPiece={businessSettings.hallmarkChargePerPiece}
      />
    </main>
  )
}
