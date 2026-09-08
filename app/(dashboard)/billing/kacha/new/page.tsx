import type { Metadata } from "next"

import {
  getKachaInvoiceFormCustomers,
  getKachaInvoiceFormStockItems,
} from "@/lib/actions/kacha-invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions"
import { getStoreMetals, getAllStoreMetalOrigins } from "@/lib/actions/taxonomy-actions"
import { getCaratConversionRateMap, getMetalSellingRateMap } from "@/lib/actions/purity-actions"

import { KachaInvoiceForm } from "@/components/billing/kacha/kacha-invoice-form"
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper"

export const metadata: Metadata = {
  title: "New Estimate",
}

export default async function NewKachaInvoicePage() {
  const [customers, stockItems, locations, defaultLocationId, businessSettings, metals, origins, caratConversionRates, metalSellingRates] =
    await Promise.all([
      getKachaInvoiceFormCustomers(),
      getKachaInvoiceFormStockItems(),
      getStoreLocations(),
      getDefaultLocationId(),
      getBusinessSettings(),
      getStoreMetals(),
      getAllStoreMetalOrigins(),
      getCaratConversionRateMap(),
      getMetalSellingRateMap(),
    ])

  return (
    <main className="space-y-6 p-6">
      <ResetFormWrapper
        requireConfirm
        header={{
          title: "New Estimate",
          description: "Record an informal sale slip for a party, without GST.",
          backHref: "/billing/kacha",
          backLabel: "Back to Estimates",
        }}
      >
        <KachaInvoiceForm
          customers={customers}
          stockItems={stockItems}
          locations={locations}
          metals={metals}
          origins={origins}
          caratConversionRates={caratConversionRates}
          metalSellingRates={metalSellingRates}
          hallmarkChargePerPiece={businessSettings.hallmarkChargePerPiece}
          initialLocationId={defaultLocationId}
        />
      </ResetFormWrapper>
    </main>
  )
}
