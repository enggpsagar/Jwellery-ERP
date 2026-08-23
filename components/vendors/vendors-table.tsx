"use client"

import Link from "next/link"
import * as React from "react"
import type { Vendor } from "@/lib/actions/vendor-actions"
import { VendorRowActions } from "@/components/vendors/vendor-row-actions"
import { VendorsPagination } from "@/components/vendors/vendors-pagination"

type StateItem = {
  id: string
  name: string
}

type VendorsTableProps = {
  vendors: Vendor[]
  states: StateItem[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
  selectedVendorIds: string[]
  onSelectionChange: (ids: string[]) => void
}

export function VendorsTable({
  vendors,
  states,
  pagination,
  selectedVendorIds,
  onSelectionChange,
}: VendorsTableProps) {
  const allIds = React.useMemo(() => vendors.map((vendor) => vendor.id), [vendors])

  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedVendorIds.includes(id))

  const someSelected =
    allIds.some((id) => selectedVendorIds.includes(id)) && !allSelected

  const headerCheckboxRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  const toggleAll = (checked: boolean) => {
    if (checked) {
      const merged = Array.from(new Set([...selectedVendorIds, ...allIds]))
      onSelectionChange(merged)
      return
    }

    onSelectionChange(
      selectedVendorIds.filter((id) => !allIds.includes(id))
    )
  }

  const toggleOne = (vendorId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange(Array.from(new Set([...selectedVendorIds, vendorId])))
      return
    }

    onSelectionChange(selectedVendorIds.filter((id) => id !== vendorId))
  }

  if (!vendors.length) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center text-sm text-gray-500">
        No vendors found.
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
                  aria-label="Select all vendors"
                  className="h-4 w-4 rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-3 font-medium">Vendor Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">City</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium">Balance</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {vendors.map((vendor) => {
              const checked = selectedVendorIds.includes(vendor.id)

              return (
                <tr key={vendor.id} className="border-t">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleOne(vendor.id, e.target.checked)}
                      aria-label={`Select ${vendor.name}`}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </td>

                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link
                      href={`/vendors/${vendor.id}`}
                      className="hover:underline"
                    >
                      {vendor.name}
                    </Link>
                  </td>

                  <td className="px-4 py-3 text-gray-700">
                    {vendor.phone || "-"}
                  </td>

                  <td className="px-4 py-3 text-gray-700">
                    {vendor.city || "-"}
                  </td>

                  <td className="px-4 py-3 text-gray-700">
                    {vendor.state || "-"}
                  </td>

                  <td className="px-4 py-3 text-gray-700">
                    ₹ {Number(vendor.openingBalance || 0).toLocaleString("en-IN")}
                  </td>

                  <td className="px-4 py-3">
                    <VendorRowActions vendor={vendor} states={states} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <VendorsPagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalCount={pagination.totalCount}
        totalPages={pagination.totalPages}
      />
    </div>
  )
}
