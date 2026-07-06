import { Package, Shapes, Boxes } from "lucide-react"

import { getProducts } from "@/lib/actions/inventory/product-actions"
import { getInventoryStock } from "@/lib/actions/inventory/stock-actions"

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string
  value: string | number
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-2 text-gray-700">{icon}</div>
      </div>
    </div>
  )
}

export default async function InventoryDashboardPage() {
  const [products, stockItems] = await Promise.all([
    getProducts(),
    getInventoryStock(),
  ])

  const activeProducts = products.filter((item) => item.isActive).length
  const totalStockItems = stockItems.length
  const inStockQty = stockItems
    .filter((item) => item.status === "IN_STOCK")
    .reduce((sum, item) => sum + item.quantity, 0)

  return (
    <main className="space-y-6 p-6">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Inventory</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage jewellery products and actual stock pieces from one place.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          title="Active Products"
          value={activeProducts}
          icon={<Shapes className="h-5 w-5" />}
        />
        <SummaryCard
          title="Total Stock Entries"
          value={totalStockItems}
          icon={<Boxes className="h-5 w-5" />}
        />
        <SummaryCard
          title="Current In-Stock Quantity"
          value={inStockQty}
          icon={<Package className="h-5 w-5" />}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Products</h2>
          <p className="mt-1 text-sm text-gray-500">
            Product masters define the design / catalogue level of jewellery.
          </p>
          <div className="mt-4">
            <a
              href="/inventory/products"
              className="inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              Manage Products
            </a>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Stock</h2>
          <p className="mt-1 text-sm text-gray-500">
            Stock entries are the actual physical items with their real weight,
            purity, pricing and status.
          </p>
          <div className="mt-4">
            <a
              href="/inventory/stock"
              className="inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              Manage Stock
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}