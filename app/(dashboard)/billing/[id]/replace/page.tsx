import { notFound, redirect } from "next/navigation"

import {
  getInvoiceById,
  getInvoiceFormCustomers,
  getInvoiceFormStockItems,
} from "@/lib/actions/invoice-actions"
import { getBusinessSettings } from "@/lib/actions/settings-actions"
import { getStoreLocations } from "@/lib/actions/store-location-actions"

import { InvoiceForm, type LineItem } from "@/components/billing/invoice-form"
import { PageBackHeader } from "@/components/shared/page-back-header"

type Props = {
  params: Promise<{ id: string }>
}

export default async function ReplaceInvoicePage({ params }: Props) {
  const { id } = await params

  const cancelledInvoice = await getInvoiceById(id)
  if (!cancelledInvoice) notFound()

  if (cancelledInvoice.status !== "CANCELLED") {
    redirect(`/billing/${id}`)
  }
  if (cancelledInvoice.replacedBy) {
    redirect(`/billing/${id}`)
  }

  const [customers, stockItems, businessSettings, locations] = await Promise.all([
    getInvoiceFormCustomers(),
    getInvoiceFormStockItems(),
    getBusinessSettings(),
    getStoreLocations(),
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
        defaultGstRate={businessSettings.defaultGstRate}
        initialCustomerId={cancelledInvoice.customer?.id}
        initialLocationId={cancelledInvoice.locationId ?? undefined}
        initialItems={initialItems}
        replacesId={cancelledInvoice.id}
        replacesInvoiceNumber={cancelledInvoice.invoiceNumber}
      />
    </main>
  )
}
