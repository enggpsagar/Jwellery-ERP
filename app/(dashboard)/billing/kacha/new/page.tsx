import type { Metadata } from "next"

import {
  getKachaInvoiceFormCustomers,
  getKachaInvoiceFormStockItems,
} from "@/lib/actions/kacha-invoice-actions"
import { getGstRates } from "@/lib/actions/gst-rate-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getSupplierOptions } from "@/lib/actions/customer-actions"
import { getLatestMetalRates } from "@/lib/actions/metal-rate-actions"
import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions"
import { getStoreMetals, getAllStoreMetalOrigins, getStoreStoneClarities } from "@/lib/actions/taxonomy-actions"
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions"
import { getFinenessMap } from "@/lib/purity-db"
import { requireStoreScope } from "@/lib/store-context"

import { KachaInvoiceForm } from "@/components/billing/kacha/kacha-invoice-form"
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper"

export const metadata: Metadata = {
  title: "New Estimate",
}

export default async function NewKachaInvoicePage() {
  const [customers, stockItems, suppliers, locations, defaultLocationId, businessSettings, metals, origins, clarityRows, caratConversionRates, enumFineness, metalRates, gstRates] =
    await Promise.all([
      getKachaInvoiceFormCustomers(),
      getKachaInvoiceFormStockItems(),
      getSupplierOptions(),
      getStoreLocations(),
      getDefaultLocationId(),
      getBusinessSettings(),
      getStoreMetals(),
      getAllStoreMetalOrigins(),
      getStoreStoneClarities(),
      getCaratConversionRateMap(),
      requireStoreScope().then(getFinenessMap),
      getLatestMetalRates(),
      getGstRates(),
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
          gstRates={gstRates}
          customers={customers}
          stockItems={stockItems}
          suppliers={suppliers}
          supplierModuleEnabled={businessSettings.supplierModuleEnabled}
          locations={locations}
          metals={metals}
          origins={origins}
          clarities={clarityRows.filter((row) => row.isActive).map((row) => row.name)}
          caratConversionRates={caratConversionRates}
          hallmarkChargePerPiece={businessSettings.hallmarkChargePerPiece}
          enumFineness={enumFineness}
          fineRates={{
            gold: metalRates.latest ? Number(metalRates.latest.gold24k) : null,
            silver: metalRates.latest?.silver != null ? Number(metalRates.latest.silver) : null,
          }}
          initialLocationId={defaultLocationId}
        />
      </ResetFormWrapper>
    </main>
  )
}
