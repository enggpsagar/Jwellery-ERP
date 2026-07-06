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
      <div className="rounded-lg border bg-white p-8 text-center text-sm text-gray-500">
        No customers found.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-600">
              <th className="w-12 px-4 py-3">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => toggleAll(e.target.checked)}
                  aria-label="Select all customers"
                  className="h-4 w-4 rounded border-gray-300"
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
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </td>

                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="hover:underline"
                    >
                      {customer.name}
                    </Link>
                  </td>

                  <td className="px-4 py-3 text-gray-700">
                    {customer.phone || "-"}
                  </td>

                  <td className="px-4 py-3 text-gray-700">
                    {customer.city || "-"}
                  </td>

                  <td className="px-4 py-3 text-gray-700">
                    {customer.state || "-"}
                  </td>

                  <td className="px-4 py-3 text-gray-700">
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