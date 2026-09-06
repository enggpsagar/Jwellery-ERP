import type { Metadata } from "next"
import { cache } from "react"
import { notFound, redirect } from "next/navigation"

import {
  getInvoiceById,
  getInvoiceFormCustomers,
  getInvoiceFormStockItems,
} from "@/lib/actions/invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions"
import { getStoreMetals, getAllStoreMetalOrigins } from "@/lib/actions/taxonomy-actions"
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions"
import { resolveGramsPerCarat, toPrimaryUnit } from "@/lib/purity"

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

  // Every field the form actually tracks, carried over from the cancelled
  // invoice's items. Stored weights are in that line's own metal's
  // configured Primary Unit, not always grams — convert back to grams here
  // since LineItem's own fields are always-grams internally (see
  // invoice-form.tsx's own doc comment), and default each unit toggle to
  // match what's actually stored.
  // GST isn't carried line-by-line: the form recomputes it from the
  // store's current default rate rather than replaying stale per-line
  // sgst/cgst amounts.
  const metalById = new Map(metals.map((m) => [m.id, m]))

  const initialItems: LineItem[] = cancelledInvoice.items.map((item) => {
    const unit = metalById.get(item.metalTypeId ?? "")?.primaryUnit ?? "GRAM"
    const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
    const toGrams = (value: number | null | undefined) =>
      toPrimaryUnit(value ?? 0, unit, "GRAM", gramsPerCarat)

    return {
    key: crypto.randomUUID(),
    itemName: item.itemName,
    metalTypeId: item.metalTypeId ?? "",
    purity: item.purity ?? "",
    quantity: item.quantity,
    grossWeight: toGrams(item.grossWeight),
    grossWeightUnit: unit,
    netWeight: toGrams(item.netWeight),
    netWeightUnit: unit,
    caratWeight: item.caratWeight ?? 0,
    // Deliberately not carried over from the cancelled invoice — an
    // exchanged item is frequently a different piece at a different
    // price, and metal rates move day to day regardless. Left blank so
    // the Store Owner enters the applicable price manually rather than
    // risk resubmitting a stale figure unnoticed.
    rate: 0,
    makingCharge: item.makingCharge,
    makingChargeType: item.makingChargeType,
    stoneCharge: item.stoneCharge,
    stoneRate: item.stoneRate ?? 0,
    hasStoneComponent: item.stoneRate != null,
    stoneChargeTouched: true,
    // Same reasoning as stoneChargeTouched/netTouched below — the cancelled
    // invoice's own saved Net Stone Weight is authoritative and must not be
    // silently recomputed from Stone Carat Weight when this line loads.
    netStoneWeightTouched: true,
    stoneMetalTypeName: item.stoneMetalTypeName ?? "",
    stoneTypeNames: item.stoneTypeNames
      ? item.stoneTypeNames.split(",").map((name) => name.trim()).filter(Boolean)
      : [],
    dmoWeight: toGrams(item.dmoWeight),
    dmoWeightUnit: unit,
    stoneWeightInput: toGrams(item.stoneWeight),
    stoneWeightUnit: unit,
    hmCharge: item.hmCharge,
    // Carried over as-is, same as stoneChargeTouched/netStoneWeightTouched
    // above — not recomputed from the store's current per-piece rate the
    // way GST recomputes from the current default rate.
    hmChargeTouched: true,
    schemeDiscount: item.schemeDiscount,
    hsnCode: item.hsnCode ?? "",
    inventoryStockId: item.inventoryStockId ?? "",
    netTouched: true,
  }
  })

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
        hallmarkChargePerPiece={businessSettings.hallmarkChargePerPiece}
        gstScheme={businessSettings.gstScheme}
        storeState={businessSettings.state}
        initialCustomerId={cancelledInvoice.customer?.id}
        initialLocationId={cancelledInvoice.locationId ?? defaultLocationId ?? undefined}
        initialItems={initialItems}
        replacesId={cancelledInvoice.id}
        replacesInvoiceNumber={cancelledInvoice.invoiceNumber}
        defaultNotes={cancelledInvoice.notes || businessSettings.invoiceNotes || undefined}
      />
    </main>
  )
}
