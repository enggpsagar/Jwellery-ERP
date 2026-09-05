"use client"

import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Printer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTableToolbar } from "@/components/shared/data-table-toolbar"
import { exportInventoryStockToExcel } from "@/lib/actions/inventory/stock-actions"
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions"
import { UNASSIGNED_METAL_TYPE } from "@/lib/business-units"

type StockToolbarProps = {
  selectedIds: string[]
  /** The store's own configured metals/stones (Settings > Taxonomy) — the
   * Type filter's options come directly from this list, so a metal added
   * there shows up here with no code change. */
  metals: StoreMetalRow[]
  /** BulkDeleteButton, rendered inside DataTableToolbar's own bordered bar
   * (next to Export) instead of as a separate floating box beside it. */
  bulkActions?: ReactNode
}

export function StockToolbar({ selectedIds, metals, bulkActions }: StockToolbarProps) {
  const router = useRouter()

  const handlePrintQr = () => {
    if (!selectedIds.length) return
    router.push(`/inventory/stock/print-qr?ids=${selectedIds.join(",")}`)
  }

  return (
    <div className="space-y-3">
      <DataTableToolbar
        searchPlaceholder="Search by stock code, tag number, product..."
        sortOptions={[
          { value: "createdAt", label: "Sort by Created Date" },
          { value: "stockCode", label: "Sort by Stock Code" },
          { value: "netWeight", label: "Sort by Net Weight" },
          { value: "saleAmount", label: "Sort by Sale Amount" },
          { value: "product", label: "Sort by Product" },
          { value: "metalType", label: "Sort by Metal" },
          { value: "purity", label: "Sort by Purity" },
          { value: "quantity", label: "Sort by Qty" },
          { value: "status", label: "Sort by Status" },
          { value: "finish", label: "Sort by Finish" },
          { value: "location", label: "Sort by Location" },
          { value: "purchaseDate", label: "Sort by Purchase Date" },
        ]}
        defaultSortBy="createdAt"
        selectedIds={selectedIds}
        entityLabel="stock items"
        exportAction={exportInventoryStockToExcel}
        typeOptions={[
          ...metals
            .filter((metal) => metal.isActive)
            .map((metal) => ({ value: metal.id, label: metal.name })),
          { value: UNASSIGNED_METAL_TYPE, label: "Unassigned" },
        ]}
        bulkActions={bulkActions}
      />

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {selectedIds.length > 0
            ? `${selectedIds.length} item${selectedIds.length === 1 ? "" : "s"} selected`
            : "Select stock items to print their QR codes."}
        </p>

        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={selectedIds.length === 0}
          onClick={handlePrintQr}
        >
          <Printer className="h-4 w-4" />
          Print QR ({selectedIds.length})
        </Button>
      </div>
    </div>
  )
}
