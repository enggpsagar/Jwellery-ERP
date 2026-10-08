import type { Metadata } from "next"
import { Suspense } from "react"

import {
  getPurchaseFormParties,
  getPurchaseFormProducts,
  getStockForPurchaseConversion,
} from "@/lib/actions/purchase-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getStoreLocations, getDefaultLocationId } from "@/lib/actions/store-location-actions"
import { getStoreMetals, getAllStoreMetalOrigins, getStoreStoneClarities } from "@/lib/actions/taxonomy-actions"
import { getCaratConversionRateMap } from "@/lib/actions/purity-actions"
import { getGstRates } from "@/lib/actions/gst-rate-actions"
import { getFinenessMap } from "@/lib/purity-db"
import { requireStoreScope } from "@/lib/store-context"

import { resolveGramsPerCarat, toPrimaryUnit } from "@/lib/purity"
import { PurchaseForm, type LineItem } from "@/components/purchases/purchase-form"
import { ResetFormWrapper } from "@/components/shared/reset-form-wrapper"

export const metadata: Metadata = {
  title: "New Purchase",
}

type Props = {
  searchParams?: Promise<{
    vendorId?: string
    /** "Convert to purchase" — an Add Stock piece becomes this bill's line. */
    fromStockId?: string
    /** "Switch to New Purchase" from Add Stock. */
    productId?: string
    rate?: string
    vendorInvoiceNumber?: string
    purchaseDate?: string
  }>
}

export default async function NewPurchasePage({ searchParams }: Props) {
  const params = (await searchParams) ?? {}

  const [vendors, products, locations, defaultLocationId, businessSettings, metals, origins, caratConversionRates, gstRates, enumFineness, clarityRows] =
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
      requireStoreScope().then(getFinenessMap),
      getStoreStoneClarities(),
    ])

  // Convert: one line built from the stock piece (its own weights, already
  // in stock — createPurchase reuses it instead of adding new stock).
  const conversion = params.fromStockId ? await getStockForPurchaseConversion(params.fromStockId) : null
  let conversionItems: LineItem[] | undefined
  if (conversion) {
    const unit = metals.find((m) => m.id === conversion.metalTypeId)?.primaryUnit ?? "GRAM"
    const gramsPerCarat = resolveGramsPerCarat(conversion.purity, caratConversionRates)
    const toGrams = (value: number) => toPrimaryUnit(value, unit, "GRAM", gramsPerCarat)
    conversionItems = [
      {
        key: crypto.randomUUID(),
        existingStockId: conversion.id,
        productId: conversion.productId,
        itemName: conversion.productName,
        itemKind: conversion.stoneMetalTypeName && !conversion.netWeight ? "STONE" : "METAL",
        metalTypeId: conversion.metalTypeId ?? "",
        purity: conversion.purity ?? "",
        purityLabel: conversion.purityLabel ?? "",
        quantity: conversion.quantity,
        grossWeight: toGrams(conversion.grossWeight),
        grossWeightUnit: unit,
        netWeight: toGrams(conversion.netWeight),
        netWeightUnit: unit,
        caratWeight: conversion.caratWeight,
        rate: conversion.rate,
        makingCharge: conversion.makingCharge,
        makingChargeType: conversion.makingChargeType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED",
        stoneCharge: conversion.stoneCharge,
        stoneRate: conversion.stoneRate,
        hasStoneComponent: Boolean(conversion.stoneRate || conversion.stoneMetalTypeName),
        stoneChargeTouched: true,
        netStoneWeightTouched: true,
        stoneMetalTypeName: conversion.stoneMetalTypeName ?? "",
        stoneTypeNames: conversion.stoneTypeNames
          ? conversion.stoneTypeNames.split(",").map((name) => name.trim()).filter(Boolean)
          : [],
        dmoWeight: toGrams(conversion.dmoWeight),
        dmoWeightUnit: unit,
        wastagePercent: null,
        stoneWeightInput: toGrams(conversion.stoneWeight),
        stoneWeightUnit: unit,
        hsnCode: conversion.hsnCode ?? "",
        netTouched: true,
        gstRateId: "",
        productLinkDecided: true,
        multiPart: false,
        components: [],
      },
    ]
  }
  const prefillRate = Number(params.rate)

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl space-y-6 p-6">
      {/* PurchaseForm reads ?newCustomerId / ?newProductId via useSearchParams,
          which needs a Suspense boundary to avoid opting the whole route out
          of static optimisation. */}
      <ResetFormWrapper
        requireConfirm
        header={{
          title: conversion ? `Convert ${conversion.stockCode} to a purchase` : "New Purchase",
          description: conversion
            ? "Records this Add Stock piece as a purchase bill — what's owed to the supplier and GST. No new stock is added; the piece itself is used."
            : "Buy stock from a vendor — every line item adds new inventory.",
          backHref: "/purchases",
          backLabel: "Back to Purchases",
        }}
      >
        {params.fromStockId && !conversion ? (
          <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            That stock piece can&apos;t be converted — it&apos;s already on a purchase bill, sold, not in
            stock, or made of several metals. Enter a new purchase below instead.
          </p>
        ) : null}
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
            enumFineness={enumFineness}
            clarities={clarityRows.filter((row) => row.isActive).map((row) => row.name)}
            storeState={businessSettings.state}
            initialLocationId={defaultLocationId}
            initialVendorId={conversion?.vendorId ?? params.vendorId}
            initialItems={conversionItems}
            defaultPurchaseDate={conversion?.purchaseDate ?? params.purchaseDate}
            defaultVendorInvoiceNumber={conversion?.vendorInvoiceNumber ?? params.vendorInvoiceNumber}
            prefillProductId={conversion ? undefined : params.productId}
            prefillRate={Number.isFinite(prefillRate) && prefillRate > 0 ? prefillRate : undefined}
          />
        </Suspense>
      </ResetFormWrapper>
    </main>
  )
}
