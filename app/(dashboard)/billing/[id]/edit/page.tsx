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
import { getCaratConversionRateMap, getMetalSellingRateMap } from "@/lib/actions/purity-actions"
import { getGstRates } from "@/lib/actions/gst-rate-actions"
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
    return { title: invoice ? `Edit Invoice ${invoice.invoiceNumber}` : "Edit Invoice" }
  } catch {
    return { title: "Edit Invoice" }
  }
}

export default async function EditInvoicePage({ params }: Props) {
  const { id } = await params

  const invoice = await getInvoice(id)
  if (!invoice) notFound()

  // Full line-item editing is only available for DRAFT/PARTIAL — CANCELLED
  // has no edit at all, and PAID keeps the basic EditInvoiceDialog instead
  // (a fully paid invoice's total can't silently change without a real
  // refund decision, same reasoning cancelInvoice already applies).
  if (invoice.status !== "DRAFT" && invoice.status !== "PARTIAL") {
    redirect(`/billing/${id}`)
  }

  const [customers, stockItems, businessSettings, locations, metals, origins, caratConversionRates, metalSellingRates, gstRates] =
    await Promise.all([
      getInvoiceFormCustomers(),
      getInvoiceFormStockItems(id),
      getBusinessSettings(),
      getStoreLocations(),
      getStoreMetals(),
      getAllStoreMetalOrigins(),
      getCaratConversionRateMap(),
      getMetalSellingRateMap(),
      getGstRates(),
    ])

  // Weight fields on a saved invoice item are persisted in that line's own
  // metal's configured Primary Unit (Settings > Taxonomy), not always
  // grams — convert back to grams here since LineItem's own fields are
  // always-grams internally (see invoice-form.tsx's own doc comment), and
  // default each unit toggle to match what's actually stored.
  const metalById = new Map(metals.map((m) => [m.id, m]))

  const initialItems: LineItem[] = invoice.items.map((item) => {
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
    rate: item.rate ?? 0,
    makingCharge: item.makingCharge,
    makingChargeType: item.makingChargeType,
    stoneCharge: item.stoneCharge,
    stoneRate: item.stoneRate ?? 0,
    hasStoneComponent: item.stoneRate != null,
    stoneChargeTouched: true,
    // Same reasoning as stoneChargeTouched/netTouched below — this invoice's
    // own saved Net Stone Weight is authoritative and must not be silently
    // recomputed from Stone Carat Weight the moment this line is reopened.
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
    // This invoice's own saved HM Charge is authoritative — must not be
    // silently recomputed from Purity the moment this line is reopened
    // (same reasoning as stoneChargeTouched/netStoneWeightTouched above).
    hmChargeTouched: true,
    schemeDiscount: item.schemeDiscount,
    hsnCode: item.hsnCode ?? "",
    inventoryStockId: item.inventoryStockId ?? "",
    // This line's own saved GST rate — falls back to blank (resolved to
    // the invoice's own default-for-new-lines rate by the form) only for
    // a row saved before per-line GST rates existed.
    gstRateId: item.gstRateId ?? "",
    netTouched: true,
  }
  })

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={`Edit ${invoice.invoiceNumber}`}
        description="Change quantities, rates, making/stone charges, or any line item — stock and the customer's ledger are reconciled automatically."
        backHref={`/billing/${id}`}
        backLabel="Back to Invoice"
      />

      <InvoiceForm
        customers={customers}
        stockItems={stockItems}
        locations={locations}
        metals={metals}
        origins={origins}
        caratConversionRates={caratConversionRates}
        metalSellingRates={metalSellingRates}
        gstRates={gstRates}
        initialGstRateId={invoice.gstRateId ?? undefined}
        defaultGstRate={businessSettings.defaultGstRate}
        hallmarkChargePerPiece={businessSettings.hallmarkChargePerPiece}
        gstScheme={businessSettings.gstScheme}
        storeState={businessSettings.state}
        initialCustomerId={invoice.customer?.id}
        initialLocationId={invoice.locationId ?? undefined}
        initialItems={initialItems}
        editInvoiceId={invoice.id}
        defaultNotes={invoice.notes || businessSettings.invoiceNotes || undefined}
      />
    </main>
  )
}
