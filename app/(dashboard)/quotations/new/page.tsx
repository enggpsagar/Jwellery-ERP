import type { Metadata } from "next"

import {
  getQuotationFormCustomers,
  getQuotationFormStockItems,
} from "@/lib/actions/quotation-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getSupplierOptions } from "@/lib/actions/customer-actions"
import { getDefaultLocationId, getStoreLocations } from "@/lib/actions/store-location-actions"
import { getStoreMetals, getAllStoreMetalOrigins } from "@/lib/actions/taxonomy-actions"
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions"
import { getGstRates } from "@/lib/actions/gst-rate-actions"
import { getFinenessMap } from "@/lib/purity-db"
import { getLatestMetalRates } from "@/lib/actions/metal-rate-actions"
import { requireStoreScope } from "@/lib/store-context"

import { QuotationForm } from "@/components/quotations/quotation-form"
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper"

export const metadata: Metadata = {
  title: "New Quotation",
}

export default async function NewQuotationPage() {
  const [customers, stockItems, suppliers, locations, defaultLocationId, businessSettings, metals, origins, caratConversionRates, gstRates, enumFineness, metalRates] =
    await Promise.all([
      getQuotationFormCustomers(),
      getQuotationFormStockItems(),
      getSupplierOptions(),
      getStoreLocations(),
      getDefaultLocationId(),
      getBusinessSettings(),
      getStoreMetals(),
      getAllStoreMetalOrigins(),
      getCaratConversionRateMap(),
      getGstRates(),
      requireStoreScope().then(getFinenessMap),
      getLatestMetalRates(),
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
          suppliers={suppliers}
          supplierModuleEnabled={businessSettings.supplierModuleEnabled}
          locations={locations}
          defaultLocationId={defaultLocationId}
          metals={metals}
          origins={origins}
          caratConversionRates={caratConversionRates}
          gstRates={gstRates}
          defaultGstRate={businessSettings.defaultGstRate}
          hallmarkChargePerPiece={businessSettings.hallmarkChargePerPiece}
          gstScheme={businessSettings.gstScheme}
          storeState={businessSettings.state}
          enumFineness={enumFineness}
          fineRates={{
            gold: metalRates.latest ? Number(metalRates.latest.gold24k) : null,
            silver: metalRates.latest ? Number(metalRates.latest.silver) : null,
          }}
        />
      </ResetFormWrapper>
    </main>
  )
}
