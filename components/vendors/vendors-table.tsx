"use client"

import Link from "next/link"
import { RecordHoverCard } from "@/components/shared/record-hover-card"
import * as React from "react"
import type { Vendor } from "@/lib/actions/vendor-actions"
import { VendorsPagination } from "@/components/vendors/vendors-pagination"
import { SortableTableHead } from "@/components/shared/sortable-table-head"
import { cn } from "@/lib/utils"

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

type VendorsTableProps = {
  vendors: Vendor[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
  selectedVendorIds: string[]
  onSelectionChange: (ids: string[]) => void
  /** Which row's detail is showing in the panel alongside this table — distinct from selectedVendorIds, which is the bulk-action checkbox selection. */
  activeVendorId?: string | null
  onActivate?: (id: string) => void
}

export function VendorsTable({
  vendors,
  pagination,
  selectedVendorIds,
  onSelectionChange,
  activeVendorId,
  onActivate,
}: VendorsTableProps) {
  const allIds = React.useMemo(() => vendors.map((vendor) => vendor.id), [vendors])

  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedVendorIds.includes(id))

  const someSelected =
    allIds.some((id) => selectedVendorIds.includes(id)) && !allSelected

  const headerCheckboxRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  const toggleAll = (checked: boolean) => {
    if (checked) {
      const merged = Array.from(new Set([...selectedVendorIds, ...allIds]))
      onSelectionChange(merged)
      return
    }

    onSelectionChange(
      selectedVendorIds.filter((id) => !allIds.includes(id))
    )
  }

  const toggleOne = (vendorId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange(Array.from(new Set([...selectedVendorIds, vendorId])))
      return
    }

    onSelectionChange(selectedVendorIds.filter((id) => id !== vendorId))
  }

  if (!vendors.length) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        No vendors found.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left text-muted-foreground">
              <th className="w-12 px-4 py-3">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => toggleAll(e.target.checked)}
                  aria-label="Select all vendors"
                  className="h-4 w-4 rounded border-input"
                />
              </th>
              <SortableTableHead label="Vendor Name" sortKey="name" defaultSortBy="createdAt" />
              <SortableTableHead label="Phone" sortKey="phone" defaultSortBy="createdAt" />
              {/* City/State hidden below sm — same fix as customers-table.tsx:
                  this table sits inside overflow-x-auto with no scroll
                  affordance shown, so these two silently scrolled out of
                  view on a phone with nothing indicating more columns
                  existed. Outstanding stays visible at every width. */}
              <SortableTableHead label="City" sortKey="city" defaultSortBy="createdAt" className="hidden sm:table-cell" />
              <SortableTableHead label="State" sortKey="state" defaultSortBy="createdAt" className="hidden sm:table-cell" />
              <th className="px-4 py-3">Outstanding</th>
            </tr>
          </thead>

          <tbody>
            {vendors.map((vendor) => {
              const checked = selectedVendorIds.includes(vendor.id)
              const isActive = activeVendorId === vendor.id

              return (
                <tr
                  key={vendor.id}
                  onClick={() => onActivate?.(vendor.id)}
                  className={cn(
                    "border-t",
                    onActivate && "cursor-pointer hover:bg-accent/50",
                    isActive && "bg-accent",
                  )}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleOne(vendor.id, e.target.checked)}
                      aria-label={`Select ${vendor.name}`}
                      className="h-4 w-4 rounded border-input"
                    />
                  </td>

                  <td className="px-4 py-3 font-medium text-foreground">
                    <RecordHoverCard
                      label={vendor.name}
                      href={onActivate ? undefined : `/vendors/${vendor.id}`}
                      title={vendor.name}
                      subtitle={vendor.vendorType ?? undefined}
                      footerLabel="View vendor"
                      sections={[
                        {
                          fields: [
                            { label: "Phone", value: vendor.phone },
                            { label: "Alt. phone", value: vendor.altPhone },
                            { label: "Email", value: vendor.email },
                          ],
                        },
                        {
                          fields: [
                            { label: "City", value: vendor.city },
                            { label: "State", value: vendor.state },
                            { label: "GSTIN", value: vendor.gstNumber },
                          ],
                        },
                        {
                          fields: [
                            { label: "Opening balance", value: inr(vendor.openingBalance) },
                            { label: "Purchases", value: vendor.totalOrders },
                            { label: "Purchase value", value: inr(vendor.totalPurchaseValue) },
                          ],
                        },
                      ]}
                    />
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {vendor.phone || "-"}
                  </td>

                  <td className="hidden px-4 py-3 text-foreground sm:table-cell">
                    {vendor.city || "-"}
                  </td>

                  <td className="hidden px-4 py-3 text-foreground sm:table-cell">
                    {vendor.state || "-"}
                  </td>

                  <td className="px-4 py-3">
                    {/* currentBalance (ledger-derived: opening + every
                        CREDIT purchase - every DEBIT payment), not
                        pendingAmount — pendingAmount only sums unpaid
                        Purchase.balanceAmount, so a vendor whose every
                        purchase is fully paid but has also received a
                        standalone advance payment (no purchase to apply it
                        against yet) showed a flatly wrong "₹0" here despite
                        the ledger clearly showing money paid out beyond
                        what was ever billed. See mapVendor's own comment on
                        why these are two different, both-real numbers. */}
                    <span
                      className={cn(
                        "font-medium",
                        vendor.balanceType === "Payable" && (vendor.currentBalance ?? 0) > 0
                          ? "text-red-600"
                          : vendor.balanceType === "Advance"
                            ? "text-blue-600"
                            : "text-foreground",
                      )}
                    >
                      {vendor.balanceType === "Advance"
                        ? `${inr(Math.abs(vendor.currentBalance ?? 0))} Advance`
                        : inr(vendor.currentBalance ?? 0) || "₹0"}
                    </span>
                  </td>

                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <VendorsPagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalCount={pagination.totalCount}
        totalPages={pagination.totalPages}
      />
    </div>
  )
}
