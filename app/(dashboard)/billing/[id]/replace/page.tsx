import type { Metadata } from "next"
import { cache } from "react"
import { notFound, redirect } from "next/navigation"

import {
  getInvoiceById,
  getInvoiceFormCustomers,
  getInvoiceFormStockItems,
} from "@/lib/actions/invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getStoreLocations } from "@/lib/actions/store-location-actions"
import { getStoreMetals, getAllStoreMetalOrigins } from "@/lib/actions/taxonomy-actions"
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions"

import { InvoiceForm, type LineItem } from "@/components/billing/invoice-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

type Props = {
  params: Promise<{ id: string }>
}

const getInvoice = cache(getInvoiceById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const invoice = await getInvoice(id)
    return { title: invoice ? `Replace Invoice ${invoice.invoiceNumber}` : "Replace Invoice" }
  } catch {
    return { title: "Replace Invoice" }
  }
}

export default async function ReplaceInvoicePage({ params }: Props) {
  const { id } = await params

  const cancelledInvoice = await getInvoice(id)
  if (!cancelledInvoice) notFound()

  if (cancelledInvoice.status !== "CANCELLED") {
    redirect(`/billing/${id}`)
  }
  if (cancelledInvoice.replacedBy) {
    redirect(`/billing/${id}`)
  }

  const [customers, stockItems, businessSettings, locations, metals, origins, caratConversionRates] =
    await Promise.all([
      getInvoiceFormCustomers(),
      getInvoiceFormStockItems(),
      getBusinessSettings(),
      getStoreLocations(),
      getStoreMetals(),
      getAllStoreMetalOrigins(),
      getCaratConversionRateMap(),
    ])

  // Every field the form actually tracks, carried over from the cancelled
  // invoice's items. Stored weights are always grams, so the unit toggle
  // starts at GRAM — the raw value round-trips correctly either way.
  // GST isn't carried line-by-line: the form recomputes it from the
  // store's current default rate rather than replaying stale per-line
  // sgst/cgst amounts.
  const initialItems: LineItem[] = cancelledInvoice.items.map((item) => ({
    key: crypto.randomUUID(),
    itemName: item.itemName,
    metalTypeId: item.metalTypeId ?? "",
    purity: item.purity ?? "",
    quantity: item.quantity,
    grossWeight: item.grossWeight ?? 0,
    netWeight: item.netWeight ?? 0,
    caratWeight: item.caratWeight ?? 0,
    rate: item.rate ?? 0,
    makingCharge: item.makingCharge,
    makingChargeType: item.makingChargeType,
    stoneCharge: item.stoneCharge,
    stoneRate: item.stoneRate ?? 0,
    hasStoneComponent: item.stoneRate != null,
    stoneChargeTouched: true,
    stoneMetalTypeName: item.stoneMetalTypeName ?? "",
    stoneTypeNames: item.stoneTypeNames
      ? item.stoneTypeNames.split(",").map((name) => name.trim()).filter(Boolean)
      : [],
    dmoWeight: item.dmoWeight ?? 0,
    stoneWeightInput: item.stoneWeight ?? 0,
    stoneWeightUnit: "GRAM",
    hmCharge: item.hmCharge,
    schemeDiscount: item.schemeDiscount,
    hsnCode: item.hsnCode ?? "",
    inventoryStockId: item.inventoryStockId ?? "",
    netTouched: true,
  }))

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={`Replace ${cancelledInvoice.invoiceNumber}`}
        description="Review and adjust before saving as a new invoice."
        backHref={`/billing/${id}`}
        backLabel="Back to Cancelled Invoice"
      />

      <InvoiceForm
        customers={customers}
        stockItems={stockItems}
        locations={locations}
        metals={metals}
        origins={origins}
        caratConversionRates={caratConversionRates}
        defaultGstRate={businessSettings.defaultGstRate}
        gstScheme={businessSettings.gstScheme}
        storeState={businessSettings.state}
        initialCustomerId={cancelledInvoice.customer?.id}
        initialLocationId={cancelledInvoice.locationId ?? undefined}
        initialItems={initialItems}
        replacesId={cancelledInvoice.id}
        replacesInvoiceNumber={cancelledInvoice.invoiceNumber}
        defaultNotes={cancelledInvoice.notes || businessSettings.invoiceNotes || undefined}
      />
    </main>
  )
}
