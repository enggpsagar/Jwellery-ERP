// FILE PATH: components/karigars/karigar-table.tsx
// REPLACES the existing file at this path
"use client"

import { KarigarRowActions } from "@/components/karigars/karigar-row-actions"
import { KarigarsPagination } from "@/components/karigars/karigars-pagination"
import type { Karigar } from "@/lib/actions/karigar-actions"

type PaginationInfo = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

type KarigarTableProps = {
  karigars: Karigar[]
  pagination: PaginationInfo
  selectedKarigarIds: string[]
  onSelectionChange: (ids: string[]) => void
}

export function KarigarTable({
  karigars,
  pagination,
  selectedKarigarIds,
  onSelectionChange,
}: KarigarTableProps) {
  const allSelected =
    karigars.length > 0 && karigars.every((k) => selectedKarigarIds.includes(k.id))

  function toggleAll() {
    if (allSelected) {
      onSelectionChange(
        selectedKarigarIds.filter((id) => !karigars.some((k) => k.id === id)),
      )
    } else {
      const newIds = karigars.map((k) => k.id)
      onSelectionChange(Array.from(new Set([...selectedKarigarIds, ...newIds])))
    }
  }

  function toggleOne(id: string) {
    if (selectedKarigarIds.includes(id)) {
      onSelectionChange(selectedKarigarIds.filter((sid) => sid !== id))
    } else {
      onSelectionChange([...selectedKarigarIds, id])
    }
  }

  if (!karigars.length) {
    return (
      <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
        No karigars found yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="w-10 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4"
                  aria-label="Select all karigars"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium">Code</th>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Mobile</th>
              <th className="px-4 py-3 text-left font-medium">Specialization</th>
              <th className="px-4 py-3 text-left font-medium">City</th>
              <th className="px-4 py-3 text-left font-medium">Opening Gold</th>
              <th className="px-4 py-3 text-left font-medium">Opening Cash</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {karigars.map((karigar) => (
              <tr key={karigar.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedKarigarIds.includes(karigar.id)}
                    onChange={() => toggleOne(karigar.id)}
                    className="h-4 w-4"
                    aria-label={`Select ${karigar.name}`}
                  />
                </td>
                <td className="px-4 py-3">{karigar.code || "-"}</td>
                <td className="px-4 py-3 font-medium">{karigar.name}</td>
                <td className="px-4 py-3">{karigar.mobile || "-"}</td>
                <td className="px-4 py-3">{karigar.specialization || "-"}</td>
                <td className="px-4 py-3">{karigar.city || "-"}</td>
                <td className="px-4 py-3">{karigar.openingGold.toFixed(3)} g</td>
                <td className="px-4 py-3">₹{karigar.openingCash.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      karigar.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {karigar.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <KarigarRowActions
                    karigarId={karigar.id}
                    karigarName={karigar.name}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <KarigarsPagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalCount={pagination.totalCount}
        pageSize={pagination.pageSize}
      />
    </div>
  )
}