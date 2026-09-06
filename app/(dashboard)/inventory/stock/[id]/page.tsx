// app/inventory/stock/[id]/page.tsx

import type { Metadata } from "next"
import { cache } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil, ScanLine } from "lucide-react"
import QRCode from "qrcode"

import { getInventoryStockById } from "@/lib/actions/inventory/stock-actions"
import { formatShortDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { StockQrCard } from "@/components/inventory/stock/stock-qr-card"
import { StockDetailContent } from "@/components/inventory/stock/stock-detail-content"

type InventoryStockDetailsPageProps = {
  params: Promise<{
    id: string
  }>
}

const getInventoryStock = cache(getInventoryStockById)

export async function generateMetadata({
  params,
}: InventoryStockDetailsPageProps): Promise<Metadata> {
  try {
    const { id } = await params
    const stock = await getInventoryStock(id)
    return { title: stock?.stockCode ?? "Stock" }
  } catch {
    return { title: "Stock" }
  }
}

function formatDate(value: Date | string | null | undefined) {
  return formatShortDate(value)
}

export default async function InventoryStockDetailsPage({
  params,
}: InventoryStockDetailsPageProps) {
  const { id } = await params
  const stock = await getInventoryStock(id)

  if (!stock) {
    notFound()
  }

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
  // Points at the scan entry point, not at this page and not straight at the
  // sale screen: /s resolves who is scanning and which shop the piece belongs
  // to, then hands over to the sale with that context already applied. Short
  // payload too, which matters on a tag printed small.
  const qrDataUrl = await QRCode.toDataURL(`${baseUrl}/s/${stock.id}`)

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
            {/* Tags printed before the QR pointed at the quick sale still land
                here, so the sale has to be one tap away from this page too. */}
            <Link href={`/s/${stock.id}`}>
              <Button type="button" variant="outline" className="gap-2">
                <ScanLine className="h-4 w-4" />
                Sell this piece
              </Button>
            </Link>

            <Link href={`/inventory/stock/${stock.id}/edit`}>
              <Button type="button" className="gap-2">
                <Pencil className="h-4 w-4" />
                Edit Stock
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <StockDetailContent
        stock={stock}
        qrCard={
          <StockQrCard
            dataUrl={qrDataUrl}
            stockCode={stock.stockCode}
            productCode={stock.product?.productCode ?? null}
            productName={stock.product?.name ?? "-"}
            tagNumber={stock.tagNumber || null}
            metalName={stock.metalType?.name ?? null}
            purity={stock.purity || null}
            netWeight={
              stock.netWeight ? `${Number(stock.netWeight).toFixed(3)}g` : null
            }
            grossWeight={
              stock.grossWeight
                ? `${Number(stock.grossWeight).toFixed(3)}g`
                : null
            }
            manufactureDate={
              stock.manufactureDate ? formatDate(stock.manufactureDate) : null
            }
          />
        }
      />
    </main>
  )
}