"use client"

import { RecordHoverCard } from "@/components/shared/record-hover-card"

import { PurchaseStatusBadge } from "@/components/purchases/purchase-status-badge"
import { SortableTableHead } from "@/components/shared/sortable-table-head"
import { cn, formatShortDate } from "@/lib/utils"

/** Money as it reads on a jewellery ledger. */
function inr(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null
  const amount = Number(value)
  if (!Number.isFinite(amount)) return null
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount)
}

type PurchaseRow = {
  id: string
  purchaseNumber: string
  purchaseDate: string
  status: string
  totalAmount: number
  balanceAmount: number
  vendor: { id: string; name: string; phone: string | null } | null
}

type PurchaseTableProps = {
  purchases: PurchaseRow[]
  /** Which row's detail shows in the panel alongside this table — when
   * provided, a row click activates it instead of the row's own hover-card
   * link navigating away. Same convention as CustomersTable. */
  activePurchaseId?: string | null
  onActivate?: (id: string) => void
}

export function PurchaseTable({ purchases, activePurchaseId, onActivate }: PurchaseTableProps) {
  if (!purchases.length) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No purchases found yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <SortableTableHead label="Purchase #" sortKey="purchaseNumber" defaultSortBy="purchaseDate" />
              <SortableTableHead label="Date" sortKey="purchaseDate" defaultSortBy="purchaseDate" />
              <th className="px-4 py-3 text-left font-medium">Vendor</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <SortableTableHead label="Total" sortKey="totalAmount" defaultSortBy="purchaseDate" />
              <th className="px-4 py-3 text-left font-medium">Balance</th>
            </tr>
          </thead>

          <tbody>
            {purchases.map((purchase) => {
              const isActive = activePurchaseId === purchase.id
              return (
              <tr
                key={purchase.id}
                onClick={() => onActivate?.(purchase.id)}
                className={cn(
                  "border-b last:border-0",
                  onActivate && "cursor-pointer hover:bg-accent/50",
                  isActive && "bg-accent",
                )}
              >
                <td className="px-4 py-3 font-medium">
                  <RecordHoverCard
                    label={purchase.purchaseNumber}
                    href={onActivate ? undefined : `/purchases/${purchase.id}`}
                    title={purchase.purchaseNumber}
                    subtitle={purchase.vendor?.name ?? undefined}
                    footerLabel="Open purchase"
                    sections={[
                      {
                        fields: [
                          {
                            label: "Date",
                            value: formatShortDate(purchase.purchaseDate),
                          },
                          { label: "Vendor", value: purchase.vendor?.name },
                          { label: "Phone", value: purchase.vendor?.phone },
                          { label: "Status", value: purchase.status },
                        ],
                      },
                      {
                        fields: [
                          { label: "Total", value: inr(purchase.totalAmount) },
                          {
                            label: "Balance",
                            value:
                              purchase.balanceAmount > 0 ? (
                                <span className="text-red-600">{inr(purchase.balanceAmount)}</span>
                              ) : (
                                "Settled"
                              ),
                          },
                        ],
                      },
                    ]}
                  />
                </td>
                <td className="px-4 py-3">
                  {formatShortDate(purchase.purchaseDate)}
                </td>
                <td className="px-4 py-3">
                  {purchase.vendor ? (
                    <RecordHoverCard
                      label={purchase.vendor.name}
                      href={`/vendors/${purchase.vendor.id}`}
                      title={purchase.vendor.name}
                      subtitle={purchase.vendor.phone ?? undefined}
                      footerLabel="View vendor"
                      sections={[
                        {
                          fields: [
                            { label: "Purchase", value: purchase.purchaseNumber },
                            {
                              label: "Date",
                              value: formatShortDate(purchase.purchaseDate),
                            },
                            { label: "Status", value: purchase.status },
                          ],
                        },
                        {
                          fields: [
                            { label: "Total", value: inr(purchase.totalAmount) },
                            {
                              label: "Balance",
                              value:
                                purchase.balanceAmount > 0
                                  ? inr(purchase.balanceAmount)
                                  : "Settled",
                            },
                          ],
                        },
                      ]}
                    />
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3">
                  <PurchaseStatusBadge status={purchase.status as any} />
                </td>
                <td className="px-4 py-3">₹{purchase.totalAmount.toFixed(2)}</td>
                <td className="px-4 py-3">
                  {purchase.balanceAmount > 0 ? (
                    <span className="text-red-600 font-medium">
                      ₹{purchase.balanceAmount.toFixed(2)}
                    </span>
                  ) : (
                    "₹0.00"
                  )}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
