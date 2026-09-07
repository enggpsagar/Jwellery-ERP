"use client"

import * as React from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

import type { Customer } from "@/lib/actions/customer-actions"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Input } from "@/components/ui/input"
import { CustomersTable } from "@/components/customers/customers-table"
import { ArchivedCustomerDetailPanel } from "@/components/customers/archived-customer-detail-panel"

type StateItem = {
  id: string
  name: string
}

type ArchivedCustomersClientProps = {
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

/**
 * Same master-detail layout as the active Customers page (search/sort/
 * paginated list on the left, full detail — including the ledger — on
 * the right) rather than a bare table, so an archived customer's history
 * is just as reachable as an active one's, not a step down to "flat list
 * with one button."
 */
export function ArchivedCustomersClient({
  customers,
  states,
  pagination,
}: ArchivedCustomersClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = React.useState(searchParams.get("search") ?? "")
  const [selectedCustomerIds, setSelectedCustomerIds] = React.useState<string[]>([])
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

  function updateSearch(value: string) {
    setSearch(value)
    const params = new URLSearchParams(searchParams.toString())
    if (value.trim()) params.set("search", value.trim())
    else params.delete("search")
    params.set("page", "1")
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Archived Parties"
        description="Parties removed from the active list. Restoring one makes it available in Parties again."
        backHref="/customers"
        backLabel="Back to Parties"
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          <div className="max-w-sm">
            <Input
              placeholder="Search archived parties..."
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
            />
          </div>

          <CustomersTable
            customers={customers}
            pagination={pagination}
            selectedCustomerIds={selectedCustomerIds}
            onSelectionChange={setSelectedCustomerIds}
            activeCustomerId={activeCustomerId}
            onActivate={setActiveCustomerId}
          />
        </div>

        <ArchivedCustomerDetailPanel customerId={activeCustomerId} states={states} />
      </div>
    </main>
  )
}
