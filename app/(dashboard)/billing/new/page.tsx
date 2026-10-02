import type { Metadata } from "next"

import {
  getInvoiceFormCustomers,
  getInvoiceFormStockItems,
} from "@/lib/actions/invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getSupplierOptions } from "@/lib/actions/customer-actions"
import { getStates } from "@/lib/actions/location-actions"
import { filterDeliveryStates } from "@/lib/delivery-location"
import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions"
import {
  getStoreMetals,
  getAllStoreMetalOrigins,
  getStoreCategories,
  getStoreStyles,
} from "@/lib/actions/taxonomy-actions"
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions"
import { getGstRates } from "@/lib/actions/gst-rate-actions"
import { resolveBackLink } from "@/lib/safe-return-to"

import { InvoiceForm } from "@/components/billing/invoice-form"
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper"

export const metadata: Metadata = {
  title: "New Invoice",
}

type Props = {
  searchParams?: Promise<{ customerId?: string; from?: string }>
}

export default async function NewInvoicePage({ searchParams }: Props) {
  const params = await searchParams
  const [customers, stockItems, suppliers, businessSettings, locations, metals, origins, categories, styles, caratConversionRates, defaultLocationId, gstRates, states] =
    await Promise.all([
      getInvoiceFormCustomers(),
      getInvoiceFormStockItems(),
      getSupplierOptions(),
      getBusinessSettings(),
      getStoreLocations(),
      getStoreMetals(),
      getAllStoreMetalOrigins(),
      getStoreCategories(),
      getStoreStyles(),
      getCaratConversionRateMap(),
      getDefaultLocationId(),
      getGstRates(),
      getStates(),
    ])

  // Arriving from a customer's own Sale action (see CustomerRowActions) —
  // that customer is already selected, so there's no reason to make the
  // user pick them again here. Only line items are still needed.
  const initialCustomerId = params?.customerId
    ? customers.find((c) => c.id === params.customerId)?.id
    : undefined

  const backTo = resolveBackLink(params?.from, {
    href: "/billing",
    label: "Back to Billing",
  })

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl space-y-6 p-6">
      <ResetFormWrapper
        requireConfirm
        header={{
          title: "New Invoice",
          description: "Bill a party for jewellery items.",
          backHref: backTo.href,
          backLabel: backTo.label,
        }}
      >
        <InvoiceForm
          customers={customers}
          stockItems={stockItems}
          suppliers={suppliers}
          supplierModuleEnabled={businessSettings.supplierModuleEnabled}
          locations={locations}
          metals={metals}
          origins={origins}
          categories={categories}
          styles={styles}
          styleFieldEnabled={businessSettings.styleFieldEnabled}
          caratConversionRates={caratConversionRates}
          initialLocationId={defaultLocationId ?? undefined}
          initialCustomerId={initialCustomerId}
          gstRates={gstRates}
          defaultGstRate={businessSettings.defaultGstRate}
          hallmarkChargePerPiece={businessSettings.hallmarkChargePerPiece}
          gstScheme={businessSettings.gstScheme}
          storeState={businessSettings.state}
          storeStateCode={businessSettings.stateCode}
          showDueDate={businessSettings.showDueDate}
          states={filterDeliveryStates(states, businessSettings.allowedDeliveryStateIds)}
          defaultNotes={businessSettings.invoiceNotes || undefined}
        />
      </ResetFormWrapper>
    </main>
  )
}
