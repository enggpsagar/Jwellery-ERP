"use client"

import { RecordHoverCard } from "@/components/shared/record-hover-card"
import * as React from "react"
import type { Customer } from "@/lib/actions/customer-actions"
import { CustomersPagination } from "@/components/customers/customers-pagination"
import { cn, toTitleCase } from "@/lib/utils"
import { PartyBalance } from "@/components/customers/party-balance"
import { formatPartyBalanceText } from "@/lib/party-balance"

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
              {/* City/State hidden below sm — on a narrow phone this table
                  sits inside overflow-x-auto with no scroll affordance, so
                  the least useful columns go first. Balance — the one figure
                  someone actually needs on this list — stays visible at
                  every width. */}
              <th className="hidden px-4 py-3 font-medium sm:table-cell">City</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">State</th>
              {/* The party's ONE net balance (lib/party-balance.ts): opening
                  + every sale/payment-out DEBIT − every purchase/payment-in/
                  return CREDIT, across both sides of its ledger. Replaces the
                  old separate Outstanding and Payable columns. Plain <th>,
                  not sortable: computed after the page's rows are fetched,
                  not a column the database can ORDER BY. */}
              <th className="px-4 py-3 font-medium">Balance</th>
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
                    {/* With a side panel (onActivate) the click already shows
                        all of this, so no hover card over the list. */}
                    {onActivate ? (
                      toTitleCase(customer.name)
                    ) : (
                      <RecordHoverCard
                        label={toTitleCase(customer.name)}
                        href={`/customers/${customer.id}`}
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
                              {
                                label: "Opening balance",
                                value: customer.openingBalance ? formatPartyBalanceText(customer.openingBalance) : null,
                              },
                              {
                                label: "Balance",
                                value: <PartyBalance net={customer.netBalance} fractionDigits={0} />,
                              },
                              { label: "Orders", value: customer.totalOrders },
                              { label: "Last purchase", value: customer.lastPurchaseDate },
                            ],
                          },
                        ]}
                      />
                    )}
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {customer.phone || "-"}
                  </td>

                  <td className="hidden px-4 py-3 text-foreground sm:table-cell">
                    {customer.city || "-"}
                  </td>

                  <td className="hidden px-4 py-3 text-foreground sm:table-cell">
                    {customer.state || "-"}
                  </td>

                  <td className="px-4 py-3" data-testid="party-balance">
                    <PartyBalance net={customer.netBalance} fractionDigits={0} />
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