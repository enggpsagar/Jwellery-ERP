// app/inventory/stock/[id]/page.tsx

import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"

import { getInventoryStockById } from "@/lib/actions/inventory/stock-actions"
import { Button } from "@/components/ui/button"

type InventoryStockDetailsPageProps = {
  params: Promise<{
    id: string
  }>
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-"
  return new Date(value).toLocaleDateString("en-IN")
}

function formatNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return "-"
  return String(value)
}

export default async function InventoryStockDetailsPage({
  params,
}: InventoryStockDetailsPageProps) {
  const { id } = await params
  const stock = await getInventoryStockById(id)

  if (!stock) {
    notFound()
  }

  return (
    <main className="space-y-6 p-6">
      <div className="space-y-3">
        <Link
          href="/inventory/stock"
          className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline"
        >
          ← Back to Stock
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Stock Details
            </h1>
            <p className="text-sm text-muted-foreground">
              View complete inventory stock information.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href={`/inventory/stock/${stock.id}/edit`}>
              <Button type="button" className="gap-2">
                <Pencil className="h-4 w-4" />
                Edit Stock
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Basic Information</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Stock Code</p>
              <p className="font-medium">{stock.stockCode}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Tag Number</p>
              <p className="font-medium">{stock.tagNumber || "-"}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Product</p>
              <p className="font-medium">
                {stock.product?.productCode} — {stock.product?.name}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="font-medium">{stock.status}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Metal Type</p>
              <p className="font-medium">{stock.metalType}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Purity</p>
              <p className="font-medium">{stock.purity || "-"}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Quantity</p>
              <p className="font-medium">{stock.quantity}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="font-medium">{stock.isActive ? "Yes" : "No"}</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Weight Details</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Gross Weight</p>
              <p className="font-medium">{formatNumber(stock.grossWeight)}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Less Weight</p>
              <p className="font-medium">{formatNumber(stock.lessWeight)}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Net Weight</p>
              <p className="font-medium">{formatNumber(stock.netWeight)}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Stone Weight</p>
              <p className="font-medium">{formatNumber(stock.stoneWeight)}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Wastage %</p>
              <p className="font-medium">{formatNumber(stock.wastagePercent)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Pricing Details</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Purchase Rate</p>
              <p className="font-medium">{formatNumber(stock.purchaseRate)}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Sale Rate</p>
              <p className="font-medium">{formatNumber(stock.saleRate)}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Making Charge</p>
              <p className="font-medium">{formatNumber(stock.makingCharge)}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Stone Charge</p>
              <p className="font-medium">{formatNumber(stock.stoneCharge)}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Other Charge</p>
              <p className="font-medium">{formatNumber(stock.otherCharge)}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Purchase Amount</p>
              <p className="font-medium">{formatNumber(stock.purchaseAmount)}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Sale Amount</p>
              <p className="font-medium">{formatNumber(stock.saleAmount)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Source / Extra Details</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Vendor Name</p>
              <p className="font-medium">{stock.vendorName || "-"}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Purchase Date</p>
              <p className="font-medium">{formatDate(stock.purchaseDate)}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="font-medium">{stock.location || "-"}</p>
            </div>

            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Remarks</p>
              <p className="font-medium whitespace-pre-wrap">
                {stock.remarks || "-"}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}