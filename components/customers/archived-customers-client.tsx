"use client"

import { useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

import type { Customer } from "@/lib/actions/customer-actions"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Input } from "@/components/ui/input"
import { CustomersPagination } from "@/components/customers/customers-pagination"
import { ArchivedCustomerRestoreButton } from "@/components/customers/archived-customer-restore-button"

type ArchivedCustomersClientProps = {
  customers: Customer[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

export function ArchivedCustomersClient({
  customers,
  pagination,
}: ArchivedCustomersClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get("search") ?? "")

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
        title="Archived Customers"
        description="Customers removed from the active list. Restoring one makes it available in Customers again."
        backHref="/customers"
        backLabel="Back to Customers"
      />

      <div className="max-w-sm">
        <Input
          placeholder="Search archived customers..."
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {customers.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No archived customers.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Customer Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">City</th>
                  <th className="px-4 py-3 font-medium">State</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id} className="border-t">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {customer.name}
                    </td>
                    <td className="px-4 py-3 text-foreground">{customer.phone || "-"}</td>
                    <td className="px-4 py-3 text-foreground">{customer.city || "-"}</td>
                    <td className="px-4 py-3 text-foreground">{customer.state || "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <ArchivedCustomerRestoreButton
                        customerId={customer.id}
                        customerName={customer.name}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <CustomersPagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalCount={pagination.totalCount}
          totalPages={pagination.totalPages}
        />
      </div>
    </main>
  )
}
