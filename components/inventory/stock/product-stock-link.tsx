"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { getProductStockHistory } from "@/lib/actions/inventory/product-stock-history-actions"
import { useWeightFormat } from "@/components/providers/weight-settings-provider"

/**
 * Add Stock's link back to the picked product, with what's in stock now
 * (the last running balance of its Stock History) — so the entry is made
 * knowing what the product already holds.
 */
export function ProductStockLink({ productId }: { productId: string }) {
  const wf = useWeightFormat()
  const [balance, setBalance] = useState<{ qty: number; net: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    setBalance(null)
    getProductStockHistory(productId).then((rows) => {
      if (cancelled) return
      const last = rows[rows.length - 1]
      setBalance({ qty: last?.balanceQty ?? 0, net: last?.balanceNetWeight ?? 0 })
    })
    return () => {
      cancelled = true
    }
  }, [productId])

  return (
    <span className="text-xs text-muted-foreground">
      {balance ? `In stock: ${balance.qty} · ${wf.g(balance.net)} g · ` : null}
      <Link href={`/inventory/products/${productId}`} target="_blank" className="font-medium text-primary underline-offset-4 hover:underline">
        View product ↗
      </Link>
    </span>
  )
}
