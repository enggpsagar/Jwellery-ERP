// app/inventory/stock/[id]/edit/page.tsx

import Link from "next/link"
import { notFound } from "next/navigation"

import {
  getInventoryStockById,
  getInventoryStockFormProducts,
} from "@/lib/actions/inventory/stock-actions"
import { EditStockForm } from "@/components/inventory/stock/edit-stock-form"

type EditInventoryStockPageProps = {
  params: Promise<{
    id: string
  }>
}

function serializeValue(value: unknown) {
  if (value === null || value === undefined) return value

  if (typeof value === "object") {
    // Prisma Decimal objects stringify correctly
    if ("toString" in (value as Record<string, unknown>)) {
      const ctorName =
        (value as { constructor?: { name?: string } }).constructor?.name || ""

      if (ctorName === "Decimal") {
        return (value as { toString(): string }).toString()
      }
    }
  }

  return value
}

function serializeProduct(product: Awaited<ReturnType<typeof getInventoryStockFormProducts>>[number]) {
  return {
    ...product,
    defaultMakingCharge: serializeValue(product.defaultMakingCharge),
    defaultStoneCharge: serializeValue(product.defaultStoneCharge),
    createdAt: product.createdAt?.toISOString?.() ?? product.createdAt,
    updatedAt: product.updatedAt?.toISOString?.() ?? product.updatedAt,
  }
}

function serializeStock(stock: NonNullable<Awaited<ReturnType<typeof getInventoryStockById>>>) {
  return {
    ...stock,
    grossWeight: serializeValue(stock.grossWeight),
    lessWeight: serializeValue(stock.lessWeight),
    netWeight: serializeValue(stock.netWeight),
    stoneWeight: serializeValue(stock.stoneWeight),
    wastagePercent: serializeValue(stock.wastagePercent),
    purchaseRate: serializeValue(stock.purchaseRate),
    saleRate: serializeValue(stock.saleRate),
    makingCharge: serializeValue(stock.makingCharge),
    stoneCharge: serializeValue(stock.stoneCharge),
    otherCharge: serializeValue(stock.otherCharge),
    purchaseAmount: serializeValue(stock.purchaseAmount),
    saleAmount: serializeValue(stock.saleAmount),
    purchaseDate: stock.purchaseDate?.toISOString?.() ?? null,
    createdAt: stock.createdAt?.toISOString?.() ?? stock.createdAt,
    updatedAt: stock.updatedAt?.toISOString?.() ?? stock.updatedAt,
    product: stock.product
      ? {
          ...stock.product,
          defaultMakingCharge: serializeValue(stock.product.defaultMakingCharge),
          defaultStoneCharge: serializeValue(stock.product.defaultStoneCharge),
          createdAt: stock.product.createdAt?.toISOString?.() ?? stock.product.createdAt,
          updatedAt: stock.product.updatedAt?.toISOString?.() ?? stock.product.updatedAt,
        }
      : null,
  }
}

export default async function EditInventoryStockPage({
  params,
}: EditInventoryStockPageProps) {
  const { id } = await params

  const [stock, products] = await Promise.all([
    getInventoryStockById(id),
    getInventoryStockFormProducts(),
  ])

  if (!stock) {
    notFound()
  }

  const serializedStock = serializeStock(stock)
  const serializedProducts = products.map(serializeProduct)

  return (
    <main className="space-y-6 p-6">
      <div className="space-y-3">
        <Link
          href={`/inventory/stock/${id}`}
          className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline"
        >
          ← Back to Stock Details
        </Link>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit Stock</h1>
          <p className="text-sm text-muted-foreground">
            Update inventory stock details for this jewellery item.
          </p>
        </div>
      </div>

      <EditStockForm stock={serializedStock} products={serializedProducts} />
    </main>
  )
}