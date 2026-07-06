"use client"

import * as React from "react"
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog"
import { CustomersTable } from "@/components/customers/customers-table"
import { CustomersToolbar } from "@/components/customers/customers-toolbar"
import type { Customer } from "@/lib/actions/customer-actions"

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

        <AddCustomerDialog states={states} />
      </div>

      <CustomersToolbar selectedCustomerIds={selectedCustomerIds} />

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