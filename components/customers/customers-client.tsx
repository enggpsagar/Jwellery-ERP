"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { CustomersTable } from "@/components/customers/customers-table"
import { CustomersToolbar } from "@/components/customers/customers-toolbar"
import { BulkDeleteButton } from "@/components/shared/bulk-delete-button"
import { CustomerDetailPanel } from "@/components/customers/customer-detail-panel"
import { bulkDeleteCustomers, type Customer } from "@/lib/actions/customer-actions"

type StateItem = {
  id: string
  name: string
}

type CustomersClientProps = {
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
}

export function CustomersClient({
  customers,
  states,
  pagination,
}: CustomersClientProps) {
  const [selectedCustomerIds, setSelectedCustomerIds] = React.useState<string[]>([])
  // Which row's full detail shows in the right-hand panel — defaults to
  // the first row on this page/search result so the panel is never empty
  // on load, matching the reference layout this mirrors.
  const [activeCustomerId, setActiveCustomerId] = React.useState<string | null>(
    customers[0]?.id ?? null,
  )

  React.useEffect(() => {
    setSelectedCustomerIds([])
    setActiveCustomerId((current) => {
      if (current && customers.some((customer) => customer.id === current)) return current
      return customers[0]?.id ?? null
    })
  }, [customers])

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Showing {customers.length} of {pagination.totalCount} customers
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/customers/archived">
            <Button variant="outline">Archived Customers</Button>
          </Link>

          {/* A page, not a dialog — same as Vendors. The form is long enough
              that a modal fights the on-screen keyboard on a phone. */}
          <Link href="/customers/new">
            <Button>Add Customer</Button>
          </Link>
        </div>
      </div>

      <CustomersToolbar
        selectedCustomerIds={selectedCustomerIds}
        bulkActions={
          <BulkDeleteButton
            selectedIds={selectedCustomerIds}
            itemLabelSingular="customer"
            itemLabelPlural="customers"
            getDisplayName={(id) => customers.find((customer) => customer.id === id)?.name ?? id}
            onDelete={bulkDeleteCustomers}
            onDone={() => setSelectedCustomerIds([])}
          />
        }
      />

      {/* List + detail side by side, matching the Party List / Party
          Details / role-specific-details pattern this page follows —
          stacks on narrow viewports since there's no room for both. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <CustomersTable
          customers={customers}
          states={states}
          pagination={pagination}
          selectedCustomerIds={selectedCustomerIds}
          onSelectionChange={setSelectedCustomerIds}
          activeCustomerId={activeCustomerId}
          onActivate={setActiveCustomerId}
        />

        <CustomerDetailPanel customerId={activeCustomerId} states={states} />
      </div>
    </main>
  )
}