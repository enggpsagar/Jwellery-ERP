import type { getInventoryStockById } from "@/lib/actions/inventory/stock-actions"
import { StockStatusBadge } from "@/components/inventory/shared/stock-status-badge"
import { FinishBadge } from "@/components/inventory/shared/finish-badge"
import { formatShortDate } from "@/lib/utils"

type Stock = NonNullable<Awaited<ReturnType<typeof getInventoryStockById>>>

function formatDate(value: Date | string | null | undefined) {
  return formatShortDate(value)
}

function formatNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return "-"
  return String(value)
}

/**
 * The body of a stock item's detail view — Basic Information / QR code /
 * Weight Details / Pricing Details / Source & Extra Details. Shared between
 * the standalone /inventory/stock/[id] page and the inline detail pane on
 * the Stock list itself (StockDetailPanel), so the two can never drift
 * apart.
 *
 * The QR card is a caller-supplied slot rather than rendered inline: the
 * standalone page's QR data URL is generated server-side (via the `qrcode`
 * package against NEXTAUTH_URL), the inline panel's is a client-generated
 * twin (against window.location.origin, since a client component can't
 * read a server-only env var) — and this shared body has no reason to know
 * which.
 */
export function StockDetailContent({
  stock,
  qrCard,
}: {
  stock: Stock
  qrCard: React.ReactNode
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border bg-card p-5">
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
            <p className="font-medium">
              <StockStatusBadge status={stock.status} />
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Finish</p>
            <p className="font-medium">
              <FinishBadge finish={stock.finish} />
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Metal Type</p>
            <p className="font-medium">{stock.metalType?.name ?? "-"}</p>
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

      {qrCard}

      <section className="rounded-xl border bg-card p-5">
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

      <section className="rounded-xl border bg-card p-5">
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

      <section className="rounded-xl border bg-card p-5">
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
            <p className="font-medium">{stock.location?.name || "-"}</p>
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
  )
}
