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

  const [customers, stockItems, businessSettings, locations, metals, origins] = await Promise.all([
    getInvoiceFormCustomers(),
    getInvoiceFormStockItems(id),
    getBusinessSettings(),
    getStoreLocations(),
    getStoreMetals(),
    getAllStoreMetalOrigins(),
  ])

  const initialItems: LineItem[] = invoice.items.map((item) => ({
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
        defaultGstRate={businessSettings.defaultGstRate}
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
