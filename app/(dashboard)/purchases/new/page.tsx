import type { Metadata } from "next"
import { Suspense } from "react"

import {
  getPurchaseFormVendors,
  getPurchaseFormProducts,
} from "@/lib/actions/purchase-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getStoreLocations } from "@/lib/actions/store-location-actions"
import { getStoreMetals, getAllStoreMetalOrigins } from "@/lib/actions/taxonomy-actions"
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions"

import { PurchaseForm } from "@/components/purchases/purchase-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

export const metadata: Metadata = {
  title: "New Purchase",
}

export default async function NewPurchasePage() {
  const [vendors, products, locations, businessSettings, metals, origins, caratConversionRates] =
    await Promise.all([
      getPurchaseFormVendors(),
      getPurchaseFormProducts(),
      getStoreLocations(),
      getBusinessSettings(),
      getStoreMetals(),
      getAllStoreMetalOrigins(),
      getCaratConversionRateMap(),
    ])

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="New Purchase"
        description="Buy stock from a vendor — every line item adds new inventory."
        backHref="/purchases"
        backLabel="Back to Purchases"
      />

      {/* PurchaseForm reads ?newVendorId / ?newProductId via useSearchParams,
          which needs a Suspense boundary to avoid opting the whole route out
          of static optimisation. */}
      <Suspense fallback={null}>
        <PurchaseForm
          vendors={vendors}
          products={products}
          locations={locations}
          metals={metals}
          origins={origins}
          caratConversionRates={caratConversionRates}
          defaultGstRate={businessSettings.defaultGstRate}
          gstScheme={businessSettings.gstScheme}
          storeState={businessSettings.state}
        />
      </Suspense>
    </main>
  )
}
