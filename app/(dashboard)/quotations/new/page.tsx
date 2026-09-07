import type { Metadata } from "next"

import {
  getQuotationFormCustomers,
  getQuotationFormStockItems,
} from "@/lib/actions/quotation-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getDefaultLocationId, getStoreLocations } from "@/lib/actions/store-location-actions"
import { getStoreMetals, getAllStoreMetalOrigins } from "@/lib/actions/taxonomy-actions"
import { getCaratConversionRateMap, getMetalSellingRateMap } from "@/lib/actions/purity-actions"
import { getGstRates } from "@/lib/actions/gst-rate-actions"

import { QuotationForm } from "@/components/quotations/quotation-form"
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper"

export const metadata: Metadata = {
  title: "New Quotation",
}

export default async function NewQuotationPage() {
  const [customers, stockItems, locations, defaultLocationId, businessSettings, metals, origins, caratConversionRates, metalSellingRates, gstRates] =
    await Promise.all([
      getQuotationFormCustomers(),
      getQuotationFormStockItems(),
      getStoreLocations(),
      getDefaultLocationId(),
      getBusinessSettings(),
      getStoreMetals(),
      getAllStoreMetalOrigins(),
      getCaratConversionRateMap(),
      getMetalSellingRateMap(),
      getGstRates(),
    ])

  return (
    <main className="space-y-6 p-6">
      <ResetFormWrapper
        requireConfirm
        header={{
          title: "New Quotation",
          description: "Prepare a price quotation for a party.",
          backHref: "/quotations",
          backLabel: "Back to Quotations",
        }}
      >
        <QuotationForm
          customers={customers}
          stockItems={stockItems}
          locations={locations}
          defaultLocationId={defaultLocationId}
          metals={metals}
          origins={origins}
          caratConversionRates={caratConversionRates}
          metalSellingRates={metalSellingRates}
          gstRates={gstRates}
          defaultGstRate={businessSettings.defaultGstRate}
          hallmarkChargePerPiece={businessSettings.hallmarkChargePerPiece}
          gstScheme={businessSettings.gstScheme}
          storeState={businessSettings.state}
        />
      </ResetFormWrapper>
    </main>
  )
}
