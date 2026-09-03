// app/inventory/stock/print-qr/page.tsx

import type { Metadata } from "next"
import QRCode from "qrcode"

import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { PrintAllQrButton } from "@/components/inventory/stock/print-all-qr-button"

export const metadata: Metadata = {
  title: "Print QR Codes",
}

type PrintQrPageProps = {
  searchParams: Promise<{
    ids?: string
  }>
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

function formatWeight(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  return `${Number(value).toFixed(3)}g`
}

export default async function StockPrintQrPage({
  searchParams,
}: PrintQrPageProps) {
  const { ids: idsParam } = await searchParams
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

  const items = await Promise.all(
    stockItems.map(async (stock) => ({
      id: stock.id,
      stockCode: stock.stockCode,
      productCode: stock.product?.productCode ?? null,
      productName: stock.product?.name ?? "-",
      tagNumber: stock.tagNumber || null,
      metalName: stock.metalType?.name ?? null,
      purity: stock.purity || null,
      netWeight: formatWeight(stock.netWeight),
      grossWeight: formatWeight(stock.grossWeight),
      manufactureDate: formatDate(stock.manufactureDate),
      // Same target as the single-item QR: /s resolves the scanner's store
      // and permissions, then hands over to the sale for this piece.
      qrDataUrl: await QRCode.toDataURL(`${baseUrl}/s/${stock.id}`),
    }))
  )

  return (
    <main className="space-y-6 p-6">
      {/*
        Scoped print stylesheet, same self-contained approach as
        stock-qr-card.tsx — only the QR grid prints, nothing else on this
        page (header, back link, buttons).
      */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #stock-qr-print-grid,
          #stock-qr-print-grid * {
            visibility: visible;
          }
          #stock-qr-print-grid {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }
        }
      `}</style>

      <PageBackHeader
        title="Print Stock QR Codes"
        description={`Printing QR codes for ${items.length} selected item${
          items.length === 1 ? "" : "s"
        }.`}
        backHref="/inventory/stock"
        backLabel="Back to Stock"
        action={items.length > 0 ? <PrintAllQrButton /> : undefined}
      />

      {items.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
          No stock items selected. Go back to the stock list and select at
          least one item to print.
        </div>
      ) : (
        <div
          id="stock-qr-print-grid"
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        >
          {items.map((item) => (
            // StockQrCard bundles its own scoped print styles, id, and a
            // per-item Print button, none of which compose with this grid
            // (which prints as a single #stock-qr-print-grid block and
            // would otherwise get duplicate #stock-qr-print ids, one per
            // cell) — so the same label content is replicated inline here
            // instead of reusing that component.
            <div
              key={item.id}
              className="flex flex-col items-center gap-2 rounded-xl border bg-white p-4 text-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.qrDataUrl}
                alt={`QR code for stock ${item.stockCode}`}
                className="h-32 w-32"
                width={128}
                height={128}
              />
              <div>
                <p className="font-semibold">
                  LR# {item.tagNumber ?? item.stockCode}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.productName}
                </p>
                {/* Read off the physical tag by eye — monospace at full
                    contrast so it survives a small label and is never
                    confused with the stock code above it. */}
                {item.productCode && (
                  <p className="mt-1 font-mono text-sm font-semibold tracking-wide">
                    {item.productCode}
                  </p>
                )}
              </div>

              <div className="w-full max-w-[220px] space-y-0.5 text-left text-xs text-muted-foreground">
                {item.metalName && (
                  <p>
                    <span className="font-medium text-foreground">Metal:</span>{" "}
                    {item.metalName}
                  </p>
                )}
                {item.purity && (
                  <p>
                    <span className="font-medium text-foreground">Purity:</span>{" "}
                    {item.purity}
                  </p>
                )}
                {item.netWeight && (
                  <p>
                    <span className="font-medium text-foreground">
                      Net Weight:
                    </span>{" "}
                    {item.netWeight}
                  </p>
                )}
                {item.grossWeight && (
                  <p>
                    <span className="font-medium text-foreground">
                      Gross Weight:
                    </span>{" "}
                    {item.grossWeight}
                  </p>
                )}
                {item.manufactureDate && <p>MFG: {item.manufactureDate}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
