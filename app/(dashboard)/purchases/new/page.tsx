import type { Metadata } from "next"
import { Suspense } from "react"

import {
  getPurchaseFormParties,
  getPurchaseFormProducts,
} from "@/lib/actions/purchase-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions"
import { getStoreMetals, getAllStoreMetalOrigins } from "@/lib/actions/taxonomy-actions"
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions"
import { getGstRates } from "@/lib/actions/gst-rate-actions"

import { PurchaseForm } from "@/components/purchases/purchase-form"
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper"

export const metadata: Metadata = {
  title: "New Purchase",
}

type Props = {
  searchParams?: Promise<{ vendorId?: string }>
}

export default async function NewPurchasePage({ searchParams }: Props) {
  const params = (await searchParams) ?? {}

  const [vendors, products, locations, defaultLocationId, businessSettings, metals, origins, caratConversionRates, gstRates] =
    await Promise.all([
      getPurchaseFormParties(),
      getPurchaseFormProducts(),
      getStoreLocations(),
      getDefaultLocationId(),
      getBusinessSettings(),
      getStoreMetals(),
      getAllStoreMetalOrigins(),
      getCaratConversionRateMap(),
      getGstRates(),
    ])

  return (
    <main className="mx-auto min-w-0 max-w-6xl space-y-6 p-6">
      {/* PurchaseForm reads ?newCustomerId / ?newProductId via useSearchParams,
          which needs a Suspense boundary to avoid opting the whole route out
          of static optimisation. */}
      <ResetFormWrapper
        requireConfirm
        header={{
          title: "New Purchase",
          description: "Buy stock from a vendor — every line item adds new inventory.",
          backHref: "/purchases",
          backLabel: "Back to Purchases",
        }}
      >
        <Suspense fallback={null}>
          <PurchaseForm
            vendors={vendors}
            products={products}
            locations={locations}
            metals={metals}
            origins={origins}
            caratConversionRates={caratConversionRates}
            gstRates={gstRates}
            defaultGstRate={businessSettings.defaultGstRate}
            storeState={businessSettings.state}
            initialLocationId={defaultLocationId}
            initialVendorId={params.vendorId}
          />
        </Suspense>
      </ResetFormWrapper>
    </main>
  )
}
