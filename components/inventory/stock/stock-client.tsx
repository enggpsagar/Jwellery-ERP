"use client"

import * as React from "react"
import Link from "next/link"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { StockTable } from "@/components/inventory/stock/stock-table"
import { StockToolbar } from "@/components/inventory/stock/stock-toolbar"

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

  return (
    <main className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <PageBackHeader
          title="Inventory Stock"
          description="Manage physical stock entries for jewellery inventory."
          backHref="/inventory"
          backLabel="Back to Inventory"
        />

        <Link href="/inventory/stock/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Stock
          </Button>
        </Link>
      </div>

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
