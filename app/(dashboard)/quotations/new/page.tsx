import type { Metadata } from "next"

import {
  getQuotationFormCustomers,
  getQuotationFormStockItems,
} from "@/lib/actions/quotation-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getStoreLocations } from "@/lib/actions/store-location-actions"
import { getStoreMetals, getAllStoreMetalOrigins } from "@/lib/actions/taxonomy-actions"
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions"

import { QuotationForm } from "@/components/quotations/quotation-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

export const metadata: Metadata = {
  title: "New Quotation",
}

export default async function NewQuotationPage() {
  const [customers, stockItems, locations, businessSettings, metals, origins, caratConversionRates] =
    await Promise.all([
      getQuotationFormCustomers(),
      getQuotationFormStockItems(),
      getStoreLocations(),
      getBusinessSettings(),
      getStoreMetals(),
      getAllStoreMetalOrigins(),
      getCaratConversionRateMap(),
    ])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="New Quotation"
        description="Prepare a price quotation for a customer."
        backHref="/quotations"
        backLabel="Back to Quotations"
      />

      <QuotationForm
        customers={customers}
        stockItems={stockItems}
        locations={locations}
        metals={metals}
        origins={origins}
        caratConversionRates={caratConversionRates}
        defaultGstRate={businessSettings.defaultGstRate}
        hallmarkChargePerPiece={businessSettings.hallmarkChargePerPiece}
        gstScheme={businessSettings.gstScheme}
        storeState={businessSettings.state}
      />
    </main>
  )
}
