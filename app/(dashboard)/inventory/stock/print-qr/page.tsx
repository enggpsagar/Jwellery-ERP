// app/inventory/stock/print-qr/page.tsx

import QRCode from "qrcode"

import { prisma } from "@/lib/prisma"
import { requireStoreScope } from "@/lib/store-context"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { PrintAllQrButton } from "@/components/inventory/stock/print-all-qr-button"

type PrintQrPageProps = {
  searchParams: Promise<{
    ids?: string
  }>
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
        },
        orderBy: { createdAt: "desc" },
      })
    : []

  const items = await Promise.all(
    stockItems.map(async (stock) => ({
      id: stock.id,
      stockCode: stock.stockCode,
      productName: stock.product?.name ?? "-",
      qrDataUrl: await QRCode.toDataURL(
        `${baseUrl}/inventory/stock/${stock.id}`
      ),
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
                <p className="font-semibold">{item.stockCode}</p>
                <p className="text-sm text-muted-foreground">
                  {item.productName}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
