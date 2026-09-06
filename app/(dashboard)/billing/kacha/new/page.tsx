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
import { PageBackHeader } from "@/components/shared/page-back-header"
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper"

export const metadata: Metadata = {
  title: "New Kacha Invoice",
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
      <PageBackHeader
        title="New Kacha Slip"
        description="Record an informal sale slip for a customer, without GST."
        backHref="/billing/kacha"
        backLabel="Back to Kacha Slips"
      />

      <ResetFormWrapper requireConfirm>
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
