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
 * Edit + Delete for one invoice row. Edit is labeled "E-way Bill" (not a
 * bare pencil) since "Edit Items" elsewhere in the same action bar is also
 * a pencil icon but does something different (full line-item editing) —
 * two identical unlabeled pencils doing different things was the actual
 * confusion this fixes. Delete stays icon-only, same red-bordered square
 * PurchaseRowActions uses. Both reuse the exact dialogs InvoiceActionsBar
 * uses so there's only one edit/delete implementation to keep correct.
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
