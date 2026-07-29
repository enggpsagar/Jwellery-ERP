import Link from "next/link"
import { Package, Shapes, Boxes, AlertTriangle } from "lucide-react"

export type InventoryViewProduct = {
  isActive: boolean
}

export type InventoryViewStockItem = {
  status: string
  quantity: number
}

type InventoryViewProps = {
  products: InventoryViewProduct[]
  stockItems: InventoryViewStockItem[]
}

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

/**
 * Standalone, reusable inventory overview — same summary/quick-link layout
 * used inline on the inventory landing page, extracted here as a component
 * so it can be dropped into other places (e.g. main dashboard) as well.
 */
export function InventoryView({ products, stockItems }: InventoryViewProps) {
  const activeProducts = products.filter((item) => item.isActive).length
  const totalStockItems = stockItems.length

  const inStockQty = stockItems
    .filter((item) => item.status === "IN_STOCK")
    .reduce((sum, item) => sum + item.quantity, 0)

  const damagedCount = stockItems.filter(
    (item) => item.status === "DAMAGED",
  ).length

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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
        <SummaryCard
          title="Damaged Items"
          value={damagedCount}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Products</h2>
          <p className="mt-1 text-sm text-gray-500">
            Product masters define the design / catalogue level of jewellery.
          </p>
          <div className="mt-4">
            <Link
              href="/inventory/products"
              className="inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              Manage Products
            </Link>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Stock</h2>
          <p className="mt-1 text-sm text-gray-500">
            Stock entries are the actual physical items with their real
            weight, purity, pricing and status.
          </p>
          <div className="mt-4">
            <Link
              href="/inventory/stock"
              className="inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              Manage Stock
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
