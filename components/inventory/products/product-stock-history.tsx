"use client"

import { useEffect, useState } from "react"

import {
  getProductStockHistory,
  type ProductStockHistoryRow,
} from "@/lib/actions/inventory/product-stock-history-actions"
import { useWeightFormat } from "@/components/providers/weight-settings-provider"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, formatShortDate } from "@/lib/utils"

/**
 * The product's stock ledger (getProductStockHistory): each piece in —
 * Purchase, Add Stock, artisan receipt — and each sale / return out, with a
 * running in-stock count and net weight. Client-fetched so it works both in
 * the Products list's side panel and on the standalone product page.
 */
export function ProductStockHistory({ productId, refreshToken }: { productId: string; refreshToken?: unknown }) {
  const wf = useWeightFormat()
  const [rows, setRows] = useState<ProductStockHistoryRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    getProductStockHistory(productId).then((data) => {
      if (!cancelled) setRows(data)
    })
    return () => {
      cancelled = true
    }
  }, [productId, refreshToken])

  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <h3 className="text-lg font-semibold">Stock History</h3>
      {rows === null ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stock has been added for this product yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Entry</th>
                <th className="py-2 pr-3 font-medium">Stock</th>
                <th className="py-2 pr-3 text-right font-medium">Qty</th>
                <th className="py-2 pr-3 text-right font-medium">Net Wt</th>
                <th className="py-2 text-right font-medium">In Stock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{formatShortDate(row.date)}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={cn(
                        "font-medium",
                        row.direction === "IN" && "text-emerald-700",
                        row.direction === "OUT" && "text-red-600",
                        row.direction === "NOTE" && "text-muted-foreground",
                      )}
                    >
                      {row.kind}
                    </span>
                    {row.reference ? <span className="text-muted-foreground"> · {row.reference}</span> : null}
                    {row.party ? <div className="text-xs text-muted-foreground">{row.party}</div> : null}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{row.stockCode}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {row.direction === "NOTE" ? "—" : `${row.direction === "OUT" ? "−" : "+"}${row.quantity}`}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                    {row.direction === "NOTE" ? "—" : `${row.direction === "OUT" ? "−" : "+"}${wf.g(row.netWeight)} g`}
                  </td>
                  <td className="py-2 text-right tabular-nums whitespace-nowrap">
                    {row.balanceQty} · {wf.g(row.balanceNetWeight)} g
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
