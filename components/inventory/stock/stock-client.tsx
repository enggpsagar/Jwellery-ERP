"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Camera, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { StockTable } from "@/components/inventory/stock/stock-table"
import { StockToolbar } from "@/components/inventory/stock/stock-toolbar"
import { StockDetailPanel } from "@/components/inventory/stock/stock-detail-panel"
import { WebcamQrScanner } from "@/components/shared/webcam-qr-scanner"
import { BulkDeleteButton } from "@/components/shared/bulk-delete-button"
import { StockImportDialog } from "@/components/inventory/stock/stock-import-dialog"
import { bulkDeleteInventoryStock } from "@/lib/actions/inventory/stock-actions"
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions"

type Pagination = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

type StockClientProps = {
  stockItems: React.ComponentProps<typeof StockTable>["stockItems"]
  pagination: Pagination
  metals: StoreMetalRow[]
}

export function StockClient({ stockItems, pagination, metals }: StockClientProps) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  // Which row's full detail shows in the right-hand panel — defaults to
  // the first row on this page/search result so the panel is never empty
  // on load, matching the Customers master-detail layout this mirrors.
  const [activeStockId, setActiveStockId] = React.useState<string | null>(
    stockItems[0]?.id ?? null,
  )

  React.useEffect(() => {
    setSelectedIds([])
    setActiveStockId((current) => {
      if (current && stockItems.some((item) => item.id === current)) return current
      return stockItems[0]?.id ?? null
    })
  }, [stockItems])

  const router = useRouter()
  const [scanning, setScanning] = React.useState(false)

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageBackHeader
          title="Inventory Stock"
          description="Manage physical stock entries for jewellery inventory."
          backHref="/inventory"
          backLabel="Back to Inventory"
        />

        <div className="flex flex-wrap gap-2">
          {/* Scanning a tag is how you find a piece you are holding — far
              quicker than reading its code off the label and searching. */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setScanning((open) => !open)}
          >
            <Camera className="mr-2 h-4 w-4" />
            {scanning ? "Close scanner" : "Scan tag"}
          </Button>

          <StockImportDialog />

          <Link href="/inventory/stock/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Stock
            </Button>
          </Link>
        </div>
      </div>

      {scanning ? (
        <WebcamQrScanner
          onScanned={(stockId) => {
            // Straight to the scan entry point, the same place a phone
            // camera lands: it resolves the store and hands over to the
            // sale, so a tag behaves identically however it was read.
            setScanning(false)
            router.push(`/s/${stockId}`)
          }}
          onClose={() => setScanning(false)}
        />
      ) : null}

      {/* List + detail side by side, matching the Customers master-detail
          layout — stacks on narrow viewports since there's no room for
          both. The toolbar lives inside the table's own column (not
          spanning the detail panel too) — it filters/sorts/exports the
          table, so it belongs with the table, not the whole page. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          <StockToolbar
            selectedIds={selectedIds}
            metals={metals}
            bulkActions={
              <BulkDeleteButton
                selectedIds={selectedIds}
                itemLabelSingular="stock item"
                itemLabelPlural="stock items"
                getDisplayName={(id) =>
                  stockItems.find((item) => item.id === id)?.stockCode ?? id
                }
                onDelete={bulkDeleteInventoryStock}
                onDone={() => setSelectedIds([])}
              />
            }
          />

          <StockTable
            stockItems={stockItems}
            pagination={pagination}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            activeStockId={activeStockId}
            onActivate={setActiveStockId}
          />
        </div>

        <StockDetailPanel stockId={activeStockId} />
      </div>
    </main>
  )
}
