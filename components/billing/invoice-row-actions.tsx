"use client"

import { EditInvoiceDialog } from "@/components/billing/edit-invoice-dialog"
import { DeleteInvoiceDialog } from "@/components/billing/delete-invoice-dialog"
import type { LocationOption } from "@/components/shared/location-select"

type InvoiceRowActionsProps = {
  invoice: {
    id: string
    invoiceNumber: string
    invoiceDate: string
    dueDate: string | null
    notes: string | null
    locationId: string | null
    status: string
    ewayBillNumber?: string | null
    ewayBillDate?: string | null
    transporterName?: string | null
    vehicleNumber?: string | null
    transportMode?: string | null
    distanceKm?: number | null
  }
  locations: LocationOption[]
}

/**
 * Edit + Delete icon buttons for one invoice row — same visual convention
 * as PurchaseRowActions (indigo Edit / red Delete bordered squares), so
 * the Billing list isn't missing what every other master-detail table
 * already has. Both reuse the exact dialogs InvoiceActionsBar uses (just
 * in their compact, icon-only form) so there's only one edit/delete
 * implementation to keep correct.
 */
export function InvoiceRowActions({ invoice, locations }: InvoiceRowActionsProps) {
  const isCancelled = invoice.status === "CANCELLED"

  return (
    <div className="flex items-center justify-end gap-2">
      {!isCancelled && (
        <EditInvoiceDialog
          compact
          invoiceId={invoice.id}
          invoiceDate={invoice.invoiceDate}
          dueDate={invoice.dueDate}
          notes={invoice.notes}
          locationId={invoice.locationId}
          locations={locations}
          ewayBillNumber={invoice.ewayBillNumber}
          ewayBillDate={invoice.ewayBillDate}
          transporterName={invoice.transporterName}
          vehicleNumber={invoice.vehicleNumber}
          transportMode={invoice.transportMode}
          distanceKm={invoice.distanceKm}
        />
      )}
      {invoice.status === "DRAFT" && (
        <DeleteInvoiceDialog compact invoiceId={invoice.id} invoiceNumber={invoice.invoiceNumber} />
      )}
    </div>
  )
}
