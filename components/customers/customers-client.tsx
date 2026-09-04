"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { CustomersTable } from "@/components/customers/customers-table"
import { CustomersToolbar } from "@/components/customers/customers-toolbar"
import { BulkDeleteButton } from "@/components/shared/bulk-delete-button"
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

  React.useEffect(() => {
    setSelectedCustomerIds([])
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

      <div className="flex flex-wrap items-center gap-2">
        <CustomersToolbar selectedCustomerIds={selectedCustomerIds} />
        <BulkDeleteButton
          selectedIds={selectedCustomerIds}
          itemLabelSingular="customer"
          itemLabelPlural="customers"
          getDisplayName={(id) => customers.find((customer) => customer.id === id)?.name ?? id}
          onDelete={bulkDeleteCustomers}
          onDone={() => setSelectedCustomerIds([])}
        />
      </div>

      <CustomersTable
        customers={customers}
        states={states}
        pagination={pagination}
        selectedCustomerIds={selectedCustomerIds}
        onSelectionChange={setSelectedCustomerIds}
      />
    </main>
  )
}