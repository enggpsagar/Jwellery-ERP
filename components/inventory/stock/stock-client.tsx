"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Camera, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { StockTable } from "@/components/inventory/stock/stock-table"
import { StockToolbar } from "@/components/inventory/stock/stock-toolbar"
import { WebcamQrScanner } from "@/components/shared/webcam-qr-scanner"

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
}

export function StockClient({ stockItems, pagination }: StockClientProps) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])

  React.useEffect(() => {
    setSelectedIds([])
  }, [stockItems])

  const router = useRouter()
  const [scanning, setScanning] = React.useState(false)

  return (
    <main className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
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

      <StockToolbar selectedIds={selectedIds} />

      <StockTable
        stockItems={stockItems}
        pagination={pagination}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />
    </main>
  )
}
