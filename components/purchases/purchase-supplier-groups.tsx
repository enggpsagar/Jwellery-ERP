"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { PurchaseStatusBadge } from "@/components/purchases/purchase-status-badge"
import { cn, formatShortDate } from "@/lib/utils"

type PurchaseRow = {
  id: string
  purchaseNumber: string
  purchaseDate: string
  status: string
  totalAmount: number
  balanceAmount: number
  vendor: { id: string; name: string; phone: string | null } | null
}

export type SupplierGroup = {
  vendor: { id: string; name: string; phone: string | null }
  billCount: number
  totalAmount: number
  balanceAmount: number
  purchases: PurchaseRow[]
}

const money = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Purchases grouped by supplier (getPurchasesBySupplier): one row per
 * supplier — bills, total, balance — that expands to its bills. A bill row
 * click shows it in the detail panel, same as the flat table.
 */
export function PurchaseSupplierGroups({
  groups,
  activePurchaseId,
  onActivate,
}: {
  groups: SupplierGroup[]
  activePurchaseId?: string | null
  onActivate?: (id: string) => void
}) {
  // The first supplier starts open so the list never looks empty.
  const [open, setOpen] = React.useState<Set<string>>(() => new Set(groups[0] ? [groups[0].vendor.id] : []))

  if (!groups.length) {
    return <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No purchases found yet.</div>
  }

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b text-left">
              <th className="px-4 py-3 font-medium">Supplier / Purchase #</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Date</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Balance</th>
            </tr>
          </thead>
          {groups.map((group) => {
            const isOpen = open.has(group.vendor.id)
            return (
              <tbody key={group.vendor.id} className="border-b last:border-0">
                <tr
                  className="cursor-pointer bg-muted/20 font-medium hover:bg-accent/50"
                  onClick={() => toggle(group.vendor.id)}
                  aria-expanded={isOpen}
                >
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-90")} />
                      <Link
                        href={`/customers/${group.vendor.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="underline-offset-4 hover:underline"
                      >
                        {group.vendor.name}
                      </Link>
                      <span className="text-xs font-normal text-muted-foreground">
                        · {group.billCount} bill{group.billCount === 1 ? "" : "s"}
                      </span>
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">{money(group.totalAmount)}</td>
                  <td className={cn("px-4 py-3 text-right tabular-nums", group.balanceAmount > 0 && "text-red-600")}>
                    {money(group.balanceAmount)}
                  </td>
                </tr>
                {isOpen &&
                  group.purchases.map((purchase) => (
                    <tr
                      key={purchase.id}
                      onClick={() => onActivate?.(purchase.id)}
                      className={cn(
                        "border-t",
                        onActivate && "cursor-pointer hover:bg-accent/50",
                        activePurchaseId === purchase.id && "bg-accent",
                      )}
                    >
                      <td className="py-2.5 pl-11 pr-4">{purchase.purchaseNumber}</td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">{formatShortDate(purchase.purchaseDate)}</td>
                      <td className="px-4 py-2.5">
                        <PurchaseStatusBadge status={purchase.status as never} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(purchase.totalAmount)}</td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-right tabular-nums",
                          purchase.balanceAmount > 0 && "font-medium text-red-600",
                        )}
                      >
                        {money(purchase.balanceAmount)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            )
          })}
        </table>
      </div>
    </div>
  )
}
