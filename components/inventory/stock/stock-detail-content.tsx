import { Boxes, IndianRupee, Scale, Truck } from "lucide-react"

import type { getInventoryStockById } from "@/lib/actions/inventory/stock-actions"
import { StockStatusBadge } from "@/components/inventory/shared/stock-status-badge"
import { FinishBadge } from "@/components/inventory/shared/finish-badge"
import { ActiveBadge } from "@/components/shared/active-badge"
import { DetailField, DetailGrid, DetailSection } from "@/components/shared/detail-section"
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
 * Built on the shared DetailSection/DetailGrid/DetailField (same as
 * Customer/Vendor/User) rather than hand-rolled label/value divs — that
 * gets every blank field (Tag Number, an unset Metal Type, ...) hidden
 * entirely for free instead of showing a bare "-", and Active reads as the
 * same badge used everywhere else in the app instead of raw "Yes"/"No"
 * text. Stock Code itself isn't repeated here — it's already the QR card's
 * own identifier alongside it.
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
      <DetailSection title="Basic Information" icon={Boxes} tint="var(--chart-1)">
        <DetailGrid>
          <DetailField label="Tag Number" value={stock.tagNumber} />
          <DetailField
            label="Product"
            value={`${stock.product?.productCode} — ${stock.product?.name}`}
          />
          <DetailField label="Status" value={<StockStatusBadge status={stock.status} />} />
          <DetailField label="Finish" value={<FinishBadge finish={stock.finish} />} />
          <DetailField label="Metal Type" value={stock.metalType?.name} />
          <DetailField label="Purity" value={stock.purity} />
          <DetailField label="Quantity" value={stock.quantity} />
          <DetailField label="Active" value={<ActiveBadge isActive={stock.isActive} />} />
        </DetailGrid>
      </DetailSection>

      {qrCard}

      <DetailSection title="Weight Details" icon={Scale} tint="var(--chart-3)">
        <DetailGrid>
          <DetailField label="Gross Weight" value={formatNumber(stock.grossWeight)} />
          <DetailField label="Less Weight" value={formatNumber(stock.lessWeight)} />
          <DetailField label="Net Weight" value={formatNumber(stock.netWeight)} />
          <DetailField label="Stone Weight" value={formatNumber(stock.stoneWeight)} />
          <DetailField label="Wastage %" value={formatNumber(stock.wastagePercent)} />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Pricing Details" icon={IndianRupee} tint="var(--chart-2)">
        <DetailGrid>
          <DetailField label="Purchase Rate" value={formatNumber(stock.purchaseRate)} />
          <DetailField label="Sale Rate" value={formatNumber(stock.saleRate)} />
          <DetailField label="Making Charge" value={formatNumber(stock.makingCharge)} />
          <DetailField label="Stone Charge" value={formatNumber(stock.stoneCharge)} />
          <DetailField label="Other Charge" value={formatNumber(stock.otherCharge)} />
          <DetailField label="Purchase Amount" value={formatNumber(stock.purchaseAmount)} />
          <DetailField label="Sale Amount" value={formatNumber(stock.saleAmount)} />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Source / Extra Details" icon={Truck} tint="var(--chart-4)">
        <DetailGrid>
          <DetailField label="Vendor Name" value={stock.vendorName} />
          <DetailField label="Purchase Date" value={formatDate(stock.purchaseDate)} />
          <DetailField label="Location" value={stock.location?.name} />
          <DetailField
            label="Remarks"
            span
            value={
              stock.remarks ? (
                <span className="whitespace-pre-wrap">{stock.remarks}</span>
              ) : null
            }
          />
        </DetailGrid>
      </DetailSection>
    </div>
  )
}
