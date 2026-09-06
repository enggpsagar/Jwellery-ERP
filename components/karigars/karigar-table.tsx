// FILE PATH: components/karigars/karigar-table.tsx
// REPLACES the existing file at this path
"use client"

import { RecordHoverCard } from "@/components/shared/record-hover-card"

import { KarigarsPagination } from "@/components/karigars/karigars-pagination"
import { SortableTableHead } from "@/components/shared/sortable-table-head"
import type { Karigar } from "@/lib/actions/karigar-actions"
import { cn } from "@/lib/utils"

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
  /** Which row's detail is showing in the panel alongside this table — distinct from selectedKarigarIds, which is the bulk-action checkbox selection. */
  activeKarigarId?: string | null
  onActivate?: (id: string) => void
}

export function KarigarTable({
  karigars,
  pagination,
  selectedKarigarIds,
  onSelectionChange,
  activeKarigarId,
  onActivate,
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
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No karigars found yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
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
              <SortableTableHead label="Code" sortKey="code" defaultSortBy="createdAt" />
              <SortableTableHead label="Name" sortKey="name" defaultSortBy="createdAt" />
              <th className="px-4 py-3 text-left font-medium">Mobile</th>
              <th className="px-4 py-3 text-left font-medium">Specialization</th>
              <th className="px-4 py-3 text-left font-medium">Metal Type</th>
              <th className="px-4 py-3 text-left font-medium">City</th>
              <th className="px-4 py-3 text-left font-medium">Opening Gold</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>

          <tbody>
            {karigars.map((karigar) => {
              const isActive = activeKarigarId === karigar.id
              return (
              <tr
                key={karigar.id}
                onClick={() => onActivate?.(karigar.id)}
                className={cn(
                  "border-b last:border-0",
                  onActivate && "cursor-pointer hover:bg-accent/50",
                  isActive && "bg-accent",
                )}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedKarigarIds.includes(karigar.id)}
                    onChange={() => toggleOne(karigar.id)}
                    className="h-4 w-4"
                    aria-label={`Select ${karigar.name}`}
                  />
                </td>
                <td className="px-4 py-3">
                  {karigar.code || "-"}
                </td>
                <td className="px-4 py-3 font-medium">
                  <RecordHoverCard
                    label={karigar.name}
                    href={onActivate ? undefined : `/karigars/${karigar.id}`}
                    title={karigar.name}
                    subtitle={karigar.code || undefined}
                    footerLabel="View karigar"
                    sections={[
                      {
                        fields: [
                          { label: "Mobile", value: karigar.mobile },
                          { label: "City", value: karigar.city },
                          { label: "Specialization", value: karigar.specialization },
                          { label: "Metal Type", value: karigar.metalTypeName },
                        ],
                      },
                      {
                        fields: [
                          { label: "Opening gold", value: karigar.openingGold },
                          { label: "Opening cash", value: karigar.openingCash },
                          { label: "Status", value: karigar.isActive ? "Active" : "Inactive" },
                        ],
                      },
                    ]}
                  />
                </td>
                <td className="px-4 py-3">{karigar.mobile || "-"}</td>
                <td className="px-4 py-3">{karigar.specialization || "-"}</td>
                <td className="px-4 py-3">{karigar.metalTypeName || "-"}</td>
                <td className="px-4 py-3">{karigar.city || "-"}</td>
                <td className="px-4 py-3">{karigar.openingGold.toFixed(3)} g</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      karigar.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {karigar.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
              )
            })}
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