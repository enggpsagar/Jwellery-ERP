"use client"

import Link from "next/link"
import * as React from "react"
import type { Customer } from "@/lib/actions/customer-actions"
import { CustomerRowActions } from "@/components/customers/customer-row-actions"
import { CustomersPagination } from "@/components/customers/customers-pagination"

type StateItem = {
  id: string
  name: string
}

type CustomersTableProps = {
  customers: Customer[]
  states: StateItem[]
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
}

export function CustomersTable({
  customers,
  states,
  pagination,
  selectedCustomerIds,
  onSelectionChange,
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
        No customers found.
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
                  aria-label="Select all customers"
                  className="h-4 w-4 rounded border-input"
                />
              </th>
              <th className="px-4 py-3 font-medium">Customer Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">City</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium">Balance</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {customers.map((customer) => {
              const checked = selectedCustomerIds.includes(customer.id)

              return (
                <tr key={customer.id} className="border-t">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleOne(customer.id, e.target.checked)}
                      aria-label={`Select ${customer.name}`}
                      className="h-4 w-4 rounded border-input"
                    />
                  </td>

                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="hover:underline"
                    >
                      {customer.name}
                    </Link>
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

                  <td className="px-4 py-3 text-foreground">
                    ₹ {Number(customer.openingBalance || 0).toLocaleString("en-IN")}
                  </td>

                  <td className="px-4 py-3">
                    <CustomerRowActions customer={customer} states={states} />
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