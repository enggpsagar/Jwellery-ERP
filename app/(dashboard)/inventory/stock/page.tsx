// app/inventory/stock/page.tsx

import Link from "next/link"

import { getInventoryStock } from "@/lib/actions/inventory/stock-actions"
import { getProducts } from "@/lib/actions/inventory/product-actions"

import { AddStockDialog } from "@/components/inventory/stock/add-stock-dialog"
import { StockTable } from "@/components/inventory/stock/stock-table"

export default async function InventoryStockPage() {
  const [stockItems, products] = await Promise.all([
    getInventoryStock(),
    getProducts(),
  ])

  return (
    <main className="space-y-6 p-6">
      <div className="space-y-4">
        <Link
          href="/inventory"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Inventory
        </Link>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Inventory Stock
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage physical stock entries for jewellery inventory.
            </p>
          </div>

          <AddStockDialog products={products} />
        </div>
      </div>

      <StockTable stockItems={stockItems} />
    </main>
  )
}