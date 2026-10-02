import type { Metadata } from "next"

import {
  getKachaInvoiceFormCustomers,
  getKachaInvoiceFormStockItems,
} from "@/lib/actions/kacha-invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getSupplierOptions } from "@/lib/actions/customer-actions"
import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions"
import { getStoreMetals, getAllStoreMetalOrigins } from "@/lib/actions/taxonomy-actions"
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions"

import { KachaInvoiceForm } from "@/components/billing/kacha/kacha-invoice-form"
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper"

export const metadata: Metadata = {
  title: "New Estimate",
}

export default async function NewKachaInvoicePage() {
  const [customers, stockItems, suppliers, locations, defaultLocationId, businessSettings, metals, origins, caratConversionRates] =
    await Promise.all([
      getKachaInvoiceFormCustomers(),
      getKachaInvoiceFormStockItems(),
      getSupplierOptions(),
      getStoreLocations(),
      getDefaultLocationId(),
      getBusinessSettings(),
      getStoreMetals(),
      getAllStoreMetalOrigins(),
      getCaratConversionRateMap(),
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
          suppliers={suppliers}
          supplierModuleEnabled={businessSettings.supplierModuleEnabled}
          locations={locations}
          metals={metals}
          origins={origins}
          caratConversionRates={caratConversionRates}
          hallmarkChargePerPiece={businessSettings.hallmarkChargePerPiece}
          initialLocationId={defaultLocationId}
        />
      </ResetFormWrapper>
    </main>
  )
}
