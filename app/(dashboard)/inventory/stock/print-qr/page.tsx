// app/inventory/stock/print-qr/page.tsx

import type { Metadata } from "next"
import QRCode from "qrcode"

import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { PrintAllQrButton } from "@/components/inventory/stock/print-all-qr-button"
import { formatShortDate } from "@/lib/utils"
import {
  StockQrLabel,
  StockQrLabelPrintStyles,
  tagPurity,
} from "@/components/inventory/stock/stock-qr-label"
import { StockQrPrintRoot } from "@/components/inventory/stock/stock-qr-print-root"
import { StockBarcodeLabel } from "@/components/inventory/stock/stock-barcode-label"
import { getStockBarcodeTags } from "@/lib/actions/inventory/stock-tag-actions"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Print QR Codes",
}

type PrintQrPageProps = {
  searchParams: Promise<{
    ids?: string
    layout?: string
  }>
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null
  return formatShortDate(value)
}

function formatWeight(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  return `${Number(value).toFixed(3)}g`
}

export default async function StockPrintQrPage({
  searchParams,
}: PrintQrPageProps) {
  const { ids: idsParam, layout: layoutParam } = await searchParams
  const layout = layoutParam === "barcode" ? "barcode" : "qr"
  const ids = (idsParam ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  const storeId = await requireStoreScope()
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"

  const stockItems = ids.length
    ? await prisma.inventoryStock.findMany({
        where: { id: { in: ids }, storeId },
        include: {
          product: {
            select: {
              name: true,
              productCode: true,
            },
          },
          metalType: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : []

  const barcodeTags = layout === "barcode" ? await getStockBarcodeTags(ids) : []

  const items = layout === "barcode" ? [] : await Promise.all(
    stockItems.map(async (stock) => ({
      id: stock.id,
      stockCode: stock.stockCode,
      productCode: stock.product?.productCode ?? null,
      productName: stock.product?.name ?? "-",
      tagNumber: stock.tagNumber || null,
      metalName: stock.metalType?.name ?? null,
      purity: tagPurity(stock.purityLabel, stock.purity),
      netWeight: formatWeight(stock.netWeight),
      grossWeight: formatWeight(stock.grossWeight),
      manufactureDate: formatDate(stock.manufactureDate),
      // Same target as the single-item QR: /s resolves the scanner's store
      // and permissions, then hands over to the sale for this piece.
      qrDataUrl: await QRCode.toDataURL(`${baseUrl}/s/${stock.id}`),
    }))
  )

  const count = layout === "barcode" ? barcodeTags.length : items.length

  return (
    <main className="space-y-6 p-6">
      {/* Only the tags print — each on its own 80×30mm thermal label,
          outside the dashboard layout. See StockQrLabelPrintStyles. */}
      <StockQrLabelPrintStyles />
      <StockQrPrintRoot id="stock-qr-print-labels">
        {layout === "barcode"
          ? barcodeTags.map((tag) => <StockBarcodeLabel key={tag.id} tag={tag} />)
          : items.map((item) => <StockQrLabel key={item.id} label={item} />)}
      </StockQrPrintRoot>

      <PageBackHeader
        title="Print Stock Tags"
        description={`Printing ${layout === "barcode" ? "barcode" : "QR"} tags for ${count} selected item${
          count === 1 ? "" : "s"
        }.`}
        backHref="/inventory/stock"
        backLabel="Back to Stock"
        action={count > 0 ? <PrintAllQrButton /> : undefined}
      />

      {ids.length > 0 && (
        <div className="inline-flex rounded-lg border p-1 text-sm">
          {(["qr", "barcode"] as const).map((option) => (
            <Link
              key={option}
              href={`/inventory/stock/print-qr?ids=${ids.join(",")}${option === "barcode" ? "&layout=barcode" : ""}`}
              className={`rounded-md px-3 py-1.5 ${layout === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {option === "qr" ? "QR tag" : "Barcode tag"}
            </Link>
          ))}
        </div>
      )}

      {count === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
          No stock items selected. Go back to the stock list and select at
          least one item to print.
        </div>
      ) : (
        <div id="stock-qr-print-grid" className="flex flex-wrap gap-4">
          {layout === "barcode"
            ? barcodeTags.map((tag) => <StockBarcodeLabel key={tag.id} tag={tag} />)
            : items.map((item) => <StockQrLabel key={item.id} label={item} />)}
        </div>
      )}
    </main>
  )
}
