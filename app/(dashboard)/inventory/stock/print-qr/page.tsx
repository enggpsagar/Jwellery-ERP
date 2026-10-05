// app/inventory/stock/print-qr/page.tsx

import type { Metadata } from "next"
import QRCode from "qrcode"

import { requireStoreScope } from "@/lib/store-context"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { PrintAllQrButton } from "@/components/inventory/stock/print-all-qr-button"
import { StockQrLabel, StockQrLabelPrintStyles } from "@/components/inventory/stock/stock-qr-label"
import { StockQrPrintRoot } from "@/components/inventory/stock/stock-qr-print-root"
import { StockBarcodeLabel } from "@/components/inventory/stock/stock-barcode-label"
import { getStockTags, getStockTagSettings } from "@/lib/actions/inventory/stock-tag-actions"
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

export default async function StockPrintQrPage({
  searchParams,
}: PrintQrPageProps) {
  const { ids: idsParam, layout: layoutParam } = await searchParams
  const layout = layoutParam === "barcode" ? "barcode" : "qr"
  const ids = (idsParam ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  await requireStoreScope()
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"

  const [tags, settings] = await Promise.all([getStockTags(ids), getStockTagSettings()])
  // Same target as the single-item QR: /s resolves the scanner's store and
  // permissions, then hands over to the sale for this piece.
  const qrDataUrls =
    layout === "qr"
      ? new Map(await Promise.all(tags.map(async (tag) => [tag.id, await QRCode.toDataURL(`${baseUrl}/s/${tag.id}`)] as const)))
      : new Map<string, string>()

  const labels = tags.map((tag) =>
    layout === "barcode" ? (
      <StockBarcodeLabel key={tag.id} tag={tag} fields={settings.barcode} />
    ) : (
      <StockQrLabel key={tag.id} tag={tag} qrDataUrl={qrDataUrls.get(tag.id)!} fields={settings.qr} />
    ),
  )
  const count = tags.length

  return (
    <main className="space-y-6 p-6">
      {/* Only the tags print — each on its own 80×30mm thermal label,
          outside the dashboard layout. See StockQrLabelPrintStyles. */}
      <StockQrLabelPrintStyles />
      <StockQrPrintRoot id="stock-qr-print-labels">
        {labels}
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
          {labels}
        </div>
      )}
    </main>
  )
}
