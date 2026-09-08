import type { Metadata } from "next"
import { Suspense, cache } from "react"
import { notFound, redirect } from "next/navigation"

import {
  getPurchaseById,
  getPurchaseFormVendors,
  getPurchaseFormProducts,
  type Purchase,
} from "@/lib/actions/purchase-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getStoreLocations } from "@/lib/actions/store-location-actions"
import { getStoreMetals, getAllStoreMetalOrigins } from "@/lib/actions/taxonomy-actions"
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions"
import { getGstRates } from "@/lib/actions/gst-rate-actions"
import { resolveGramsPerCarat, toPrimaryUnit } from "@/lib/purity"

import { PurchaseForm, type LineItem } from "@/components/purchases/purchase-form"
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper"

type Props = {
  params: Promise<{ id: string }>
}

const getPurchase = cache(getPurchaseById)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const purchase = await getPurchase(id)
    return { title: purchase ? `Edit ${purchase.purchaseNumber}` : "Edit Purchase" }
  } catch {
    return { title: "Edit Purchase" }
  }
}

export default async function EditPurchasePage({ params }: Props) {
  const { id } = await params

  const purchase = await getPurchase(id)
  if (!purchase) notFound()

  // Full line-item editing is only available for DRAFT/PARTIAL — a PAID
  // purchase keeps only the metadata-only EditPurchaseDialog (date/vendor
  // invoice number/location/notes), same reasoning as Invoice's identical
  // gate. updatePurchase re-checks this itself too, plus whether this
  // purchase's stock has since moved — that second check only happens
  // server-side at submit time (see its own doc comment), not here.
  if (purchase.status !== "DRAFT" && purchase.status !== "PARTIAL") {
    redirect(`/purchases/${id}`)
  }

  const [vendors, products, locations, businessSettings, metals, origins, caratConversionRates, gstRates] =
    await Promise.all([
      getPurchaseFormVendors(),
      getPurchaseFormProducts(),
      getStoreLocations(),
      getBusinessSettings(),
      getStoreMetals(),
      getAllStoreMetalOrigins(),
      getCaratConversionRateMap(),
      getGstRates(),
    ])

  // Saved weights are persisted in each line's own metal's configured
  // Primary Unit (Settings > Taxonomy), not always grams — same convention
  // as Invoice's edit page. Converted back to grams here since LineItem's
  // own fields are always-grams internally.
  const metalById = new Map(metals.map((m) => [m.id, m]))

  const initialItems: LineItem[] = purchase.items.map((item: Purchase["items"][number]) => {
    const unit = metalById.get(item.metalTypeId ?? "")?.primaryUnit ?? "GRAM"
    const gramsPerCarat = resolveGramsPerCarat(item.purity, caratConversionRates)
    const toGrams = (value: number | null | undefined) =>
      toPrimaryUnit(value ?? 0, unit, "GRAM", gramsPerCarat)

    return {
      key: crypto.randomUUID(),
      productId: item.productId,
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
      netStoneWeightTouched: true,
      stoneMetalTypeName: item.stoneMetalTypeName ?? "",
      stoneTypeNames: item.stoneTypeNames
        ? String(item.stoneTypeNames).split(",").map((name: string) => name.trim()).filter(Boolean)
        : [],
      dmoWeight: toGrams(item.dmoWeight),
      dmoWeightUnit: unit,
      stoneWeightInput: toGrams(item.stoneWeight),
      stoneWeightUnit: unit,
      hsnCode: item.hsnCode ?? "",
      netTouched: true,
      gstRateId: item.gstRateId ?? "",
      productLinkDecided: true,
    }
  })

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <ResetFormWrapper
        requireConfirm
        header={{
          title: `Edit ${purchase.purchaseNumber}`,
          description: "Change quantities, rates, making/stone charges, or any line item — stock is reconciled automatically.",
          backHref: `/purchases/${id}`,
          backLabel: "Back to Purchase",
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
            initialLocationId={purchase.locationId}
            editPurchaseId={purchase.id}
            initialVendorId={purchase.vendor?.id}
            initialItems={initialItems}
            defaultPurchaseDate={purchase.purchaseDate.slice(0, 10)}
            defaultVendorInvoiceNumber={purchase.vendorInvoiceNumber ?? undefined}
            defaultNotes={purchase.notes ?? undefined}
            defaultPaidAmount={purchase.paidAmount}
          />
        </Suspense>
      </ResetFormWrapper>
    </main>
  )
}
