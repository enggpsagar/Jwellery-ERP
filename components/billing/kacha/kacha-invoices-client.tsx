"use client"

import * as React from "react"

import { KachaInvoiceTable } from "@/components/billing/kacha/kacha-invoice-table"
import { KachaInvoicesToolbar } from "@/components/billing/kacha/kacha-invoices-toolbar"
import { DeleteAllKachaDialog } from "@/components/billing/kacha/delete-all-kacha-dialog"
import { Button } from "@/components/ui/button"

type KachaInvoiceRow = React.ComponentProps<
  typeof KachaInvoiceTable
>["kachaInvoices"][number]

type KachaInvoicesClientProps = {
  kachaInvoices: KachaInvoiceRow[]
  /** Store Owner only — the delete action enforces the same role server-side. */
  canDelete?: boolean
}

/**
 * Holds the row selection for the Kacha list.
 *
 * The toolbar's export and the delete dialog both need to know what is
 * ticked, and the page itself is a server component, so selection lives here
 * where all three can share it.
 */
export function KachaInvoicesClient({
  kachaInvoices,
  canDelete = false,
}: KachaInvoicesClientProps) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])

  // Drop stale ids when the underlying rows change — after a delete, a page
  // change or a filter, a kept selection would refer to rows no longer here.
  React.useEffect(() => {
    setSelectedIds([])
  }, [kachaInvoices])

  const hasRecords = kachaInvoices.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <KachaInvoicesToolbar selectedIds={selectedIds} />
        </div>

        {/* Nothing to delete means no delete button — showing one on an empty
            list only invites a click that can't do anything. */}
        {canDelete && hasRecords && (
          <DeleteAllKachaDialog selectedIds={selectedIds} />
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">
            {selectedIds.length} slip{selectedIds.length === 1 ? "" : "s"} selected
          </span>
          <span className="text-muted-foreground">
            Export and Delete apply to just these.
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds([])}
          >
            Clear selection
          </Button>
        </div>
      )}

      <KachaInvoiceTable
        kachaInvoices={kachaInvoices}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />
    </div>
  )
}
