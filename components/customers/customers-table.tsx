"use client"

import { RecordHoverCard } from "@/components/shared/record-hover-card"
import * as React from "react"
import type { Customer } from "@/lib/actions/customer-actions"
import { CustomersPagination } from "@/components/customers/customers-pagination"
import { cn, toTitleCase } from "@/lib/utils"

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

type CustomersTableProps = {
  customers: Customer[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
  selectedCustomerIds: string[]
  onSelectionChange: (ids: string[]) => void
  /** Which row's detail is showing in the panel alongside this table — distinct from selectedCustomerIds, which is the bulk-action checkbox selection. */
  activeCustomerId?: string | null
  onActivate?: (id: string) => void
}

export function CustomersTable({
  customers,
  pagination,
  selectedCustomerIds,
  onSelectionChange,
  activeCustomerId,
  onActivate,
}: CustomersTableProps) {
  const allIds = React.useMemo(() => customers.map((customer) => customer.id), [customers])

  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedCustomerIds.includes(id))

  const someSelected =
    allIds.some((id) => selectedCustomerIds.includes(id)) && !allSelected

  const headerCheckboxRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  const toggleAll = (checked: boolean) => {
    if (checked) {
      const merged = Array.from(new Set([...selectedCustomerIds, ...allIds]))
      onSelectionChange(merged)
      return
    }

    onSelectionChange(
      selectedCustomerIds.filter((id) => !allIds.includes(id))
    )
  }

  const toggleOne = (customerId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange(Array.from(new Set([...selectedCustomerIds, customerId])))
      return
    }

    onSelectionChange(selectedCustomerIds.filter((id) => id !== customerId))
  }

  if (!customers.length) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        No parties found.
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
                  aria-label="Select all parties"
                  className="h-4 w-4 rounded border-input"
                />
              </th>
              <th className="px-4 py-3 font-medium">Party Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">City</th>
              <th className="px-4 py-3 font-medium">State</th>
              {/* Outstanding shows currentBalance (ledger-derived: opening
                  + every DEBIT sale - every CREDIT payment/refund), not
                  pendingAmount — pendingAmount only sums unpaid
                  Invoice/KachaInvoice balances, so a customer whose every
                  document is fully paid but who has also made a standalone
                  advance payment (no invoice yet to apply it against)
                  showed a flatly wrong "₹0" here despite the ledger clearly
                  showing money paid beyond what was ever billed. Plain
                  <th>, not SortableTableHead: this is computed after the
                  page's own rows are fetched (see getCustomers()), not a
                  real column the database can ORDER BY. */}
              <th className="px-4 py-3 font-medium">Outstanding</th>
            </tr>
          </thead>

          <tbody>
            {customers.map((customer) => {
              const checked = selectedCustomerIds.includes(customer.id)
              const isActive = activeCustomerId === customer.id

              return (
                <tr
                  key={customer.id}
                  onClick={() => onActivate?.(customer.id)}
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
                      onChange={(e) => toggleOne(customer.id, e.target.checked)}
                      aria-label={`Select ${customer.name}`}
                      className="h-4 w-4 rounded border-input"
                    />
                  </td>

                  <td className="px-4 py-3 font-medium text-foreground">
                    <RecordHoverCard
                      label={toTitleCase(customer.name)}
                      href={onActivate ? undefined : `/customers/${customer.id}`}
                      title={toTitleCase(customer.name)}
                      subtitle={customer.customerType ?? undefined}
                      footerLabel="View party"
                      sections={[
                        {
                          fields: [
                            { label: "Phone", value: customer.phone },
                            { label: "Alt. phone", value: customer.altPhone },
                            { label: "Email", value: customer.email },
                          ],
                        },
                        {
                          fields: [
                            { label: "City", value: customer.city },
                            { label: "State", value: customer.state },
                            { label: "GSTIN", value: customer.gstNumber },
                          ],
                        },
                        {
                          fields: [
                            { label: "Opening balance", value: inr(customer.openingBalance) },
                            {
                              // currentBalance (ledger-derived), not
                              // pendingAmount — see the main "Outstanding"
                              // column's own comment below for why.
                              label: "Outstanding",
                              value:
                                customer.balanceType === "Advance" ? (
                                  <span className="text-blue-600">
                                    {inr(Math.abs(customer.currentBalance ?? 0))} Advance
                                  </span>
                                ) : (customer.currentBalance ?? 0) > 0 ? (
                                  <span className="text-red-600">{inr(customer.currentBalance)}</span>
                                ) : (
                                  inr(customer.currentBalance ?? 0)
                                ),
                            },
                            { label: "Orders", value: customer.totalOrders },
                            { label: "Last purchase", value: customer.lastPurchaseDate },
                          ],
                        },
                      ]}
                    />
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {customer.phone || "-"}
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {customer.city || "-"}
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {customer.state || "-"}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "font-medium",
                        customer.balanceType === "Advance"
                          ? "text-blue-600"
                          : (customer.currentBalance ?? 0) > 0
                            ? "text-red-600"
                            : "text-foreground",
                      )}
                    >
                      {customer.balanceType === "Advance"
                        ? `${inr(Math.abs(customer.currentBalance ?? 0))} Advance`
                        : inr(customer.currentBalance ?? 0) || "₹0"}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <CustomersPagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalCount={pagination.totalCount}
        totalPages={pagination.totalPages}
      />
    </div>
  )
}