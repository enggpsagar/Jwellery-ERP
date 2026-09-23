// FILE PATH: components/karigars/karigar-table.tsx
// REPLACES the existing file at this path
"use client"

import { RecordHoverCard } from "@/components/shared/record-hover-card"

import { KarigarsPagination } from "@/components/karigars/karigars-pagination"
import { SortableTableHead } from "@/components/shared/sortable-table-head"
import type { Karigar } from "@/lib/actions/karigar-actions"
import type { KarigarLedgerSummaryRow } from "@/lib/actions/ledger-actions"
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
  /** Store-wide outstanding gold/cash per artisan (id -> row), from
   *  getKarigarLedgerSummary — what "Outstanding" below actually reads,
   *  distinct from the static one-time openingGold/openingCash still shown
   *  in the hover card. Optional: the Disabled Artisans list doesn't fetch
   *  this summary, so every row there just reads as "Settled". */
  balanceById?: Map<string, KarigarLedgerSummaryRow>
  selectedKarigarIds: string[]
  onSelectionChange: (ids: string[]) => void
  /** Which row's detail is showing in the panel alongside this table — distinct from selectedKarigarIds, which is the bulk-action checkbox selection. */
  activeKarigarId?: string | null
  onActivate?: (id: string) => void
}

export function KarigarTable({
  karigars,
  pagination,
  balanceById = new Map(),
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
        No artisans found yet.
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
                  aria-label="Select all artisans"
                />
              </th>
              <SortableTableHead label="Name" sortKey="name" defaultSortBy="createdAt" />
              <th className="px-4 py-3 text-left font-medium">Mobile</th>
              {/* City hidden below sm — same rationale as the other list
                  tables: least-essential column hidden instead of silently
                  scrolling out of view. Mobile and Opening Gold stay
                  visible. */}
              <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">City</th>
              <th className="px-4 py-3 text-left font-medium">Outstanding</th>
            </tr>
          </thead>

          <tbody>
            {karigars.map((karigar) => {
              const isActive = activeKarigarId === karigar.id
              const balance = balanceById.get(karigar.id)
              const hasGold = balance != null && Math.abs(balance.outstandingGold) >= 0.0005
              const hasCash = balance != null && Math.abs(balance.outstandingCash) >= 0.005
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
                <td className="px-4 py-3 font-medium">
                  <RecordHoverCard
                    label={karigar.name}
                    href={onActivate ? undefined : `/karigars/${karigar.id}`}
                    title={karigar.name}
                    subtitle={karigar.code || undefined}
                    footerLabel="View artisan"
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
                <td className="hidden px-4 py-3 sm:table-cell">{karigar.city || "-"}</td>
                <td className="px-4 py-3">
                  {hasGold || hasCash ? (
                    <div className="flex flex-col gap-0.5">
                      {hasGold && <span>{balance!.outstandingGold.toFixed(3)} g</span>}
                      {hasCash && (
                        <span className="text-red-600">
                          ₹{balance!.outstandingCash.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Settled</span>
                  )}
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