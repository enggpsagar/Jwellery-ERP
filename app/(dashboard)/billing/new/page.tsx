import type { Metadata } from "next"

import {
  getInvoiceFormCustomers,
  getInvoiceFormStockItems,
} from "@/lib/actions/invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions"
import { getStoreMetals, getAllStoreMetalOrigins } from "@/lib/actions/taxonomy-actions"
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions"
import { resolveBackLink } from "@/lib/safe-return-to"

import { InvoiceForm } from "@/components/billing/invoice-form"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper"

export const metadata: Metadata = {
  title: "New Invoice",
}

type Props = {
  searchParams?: Promise<{ customerId?: string; from?: string }>
}

export default async function NewInvoicePage({ searchParams }: Props) {
  const params = await searchParams
  const [customers, stockItems, businessSettings, locations, metals, origins, caratConversionRates, defaultLocationId] =
    await Promise.all([
      getInvoiceFormCustomers(),
      getInvoiceFormStockItems(),
      getBusinessSettings(),
      getStoreLocations(),
      getStoreMetals(),
      getAllStoreMetalOrigins(),
      getCaratConversionRateMap(),
      getDefaultLocationId(),
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
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="New Invoice"
        description="Bill a customer for jewellery items."
        backHref={backTo.href}
        backLabel={backTo.label}
      />

      <ResetFormWrapper requireConfirm>
        <InvoiceForm
          customers={customers}
          stockItems={stockItems}
          locations={locations}
          metals={metals}
          origins={origins}
          caratConversionRates={caratConversionRates}
          initialLocationId={defaultLocationId ?? undefined}
          initialCustomerId={initialCustomerId}
          defaultGstRate={businessSettings.defaultGstRate}
          hallmarkChargePerPiece={businessSettings.hallmarkChargePerPiece}
          gstScheme={businessSettings.gstScheme}
          storeState={businessSettings.state}
          defaultNotes={businessSettings.invoiceNotes || undefined}
        />
      </ResetFormWrapper>
    </main>
  )
}
