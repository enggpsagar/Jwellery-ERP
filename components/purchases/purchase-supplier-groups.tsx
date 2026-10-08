"use client"

import { cn } from "@/lib/utils"
import { SupplierLedgerCardClient } from "@/components/customers/ledger/supplier-ledger-card-client"
import Link from "next/link"

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
 * Purchases "By supplier" (getPurchasesBySupplier): one row per supplier —
 * bills, total, balance. Selecting a row shows that supplier's ledger in the
 * panel beside it (SupplierPurchasePanel), the same master-detail pattern as
 * the Parties page, instead of expanding bills inline.
 */
export function PurchaseSupplierGroups({
  groups,
  activeVendorId,
  onActivate,
}: {
  groups: SupplierGroup[]
  activeVendorId?: string | null
  onActivate?: (vendorId: string) => void
}) {
  if (!groups.length) {
    return <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No purchases found yet.</div>
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b text-left">
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 text-right font-medium">Bills</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr
                key={group.vendor.id}
                onClick={() => onActivate?.(group.vendor.id)}
                className={cn(
                  "border-b last:border-0",
                  onActivate && "cursor-pointer hover:bg-accent/50",
                  activeVendorId === group.vendor.id && "bg-accent",
                )}
              >
                <td className="px-4 py-3 font-medium">
                  {group.vendor.name}
                  {group.vendor.phone ? (
                    <div className="text-xs font-normal text-muted-foreground">{group.vendor.phone}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{group.billCount}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(group.totalAmount)}</td>
                <td className={cn("px-4 py-3 text-right tabular-nums", group.balanceAmount > 0 && "font-medium text-red-600")}>
                  {money(group.balanceAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * The selected supplier's panel: name (to the party page) and its Supplier
 * Ledger — every bill and payment as a ledger entry with metal, owed, paid
 * and the balance, each linked to its purchase bill. Same ledger component
 * as the Parties page, opened with its history showing.
 */
export function SupplierPurchasePanel({ group }: { group: SupplierGroup | null }) {
  if (!group) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Select a supplier to see its ledger.
      </div>
    )
  }
  return (
    <div className="space-y-4 rounded-xl border bg-card p-6">
      <div>
        <h2 className="text-lg font-semibold">
          <Link href={`/customers/${group.vendor.id}`} className="underline-offset-4 hover:underline">
            {group.vendor.name}
          </Link>
        </h2>
        <p className="text-sm text-muted-foreground">
          {group.billCount} bill{group.billCount === 1 ? "" : "s"}
          {group.vendor.phone ? ` · ${group.vendor.phone}` : ""}
        </p>
      </div>
      <SupplierLedgerCardClient customerId={group.vendor.id} defaultShowDetails />
    </div>
  )
}
