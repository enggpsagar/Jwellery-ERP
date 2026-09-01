"use client"

import { useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

import type { Vendor } from "@/lib/actions/vendor-actions"
import { PageBackHeader } from "@/components/shared/page-back-header"
import { Input } from "@/components/ui/input"
import { VendorsPagination } from "@/components/vendors/vendors-pagination"
import { ArchivedVendorRestoreButton } from "@/components/vendors/archived-vendor-restore-button"

type ArchivedVendorsClientProps = {
  vendors: Vendor[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

export function ArchivedVendorsClient({
  vendors,
  pagination,
}: ArchivedVendorsClientProps) {
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
        title="Archived Vendors"
        description="Vendors removed from the active list. Restoring one makes it available in Vendors again."
        backHref="/vendors"
        backLabel="Back to Vendors"
      />

      <div className="max-w-sm">
        <Input
          placeholder="Search archived vendors..."
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {vendors.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No archived vendors.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Vendor Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">City</th>
                  <th className="px-4 py-3 font-medium">State</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr key={vendor.id} className="border-t">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {vendor.name}
                    </td>
                    <td className="px-4 py-3 text-foreground">{vendor.phone || "-"}</td>
                    <td className="px-4 py-3 text-foreground">{vendor.city || "-"}</td>
                    <td className="px-4 py-3 text-foreground">{vendor.state || "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <ArchivedVendorRestoreButton
                        vendorId={vendor.id}
                        vendorName={vendor.name}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <VendorsPagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalCount={pagination.totalCount}
          totalPages={pagination.totalPages}
        />
      </div>
    </main>
  )
}
