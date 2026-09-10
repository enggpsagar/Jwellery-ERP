"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { StorePlanOverview } from "@/lib/actions/store-plan-actions"
import { StorePlanHover } from "@/components/stores/store-plan-hover"
import { SortableTableHead } from "@/components/shared/sortable-table-head"
import { cn } from "@/lib/utils"

type StoreRow = {
  id: string
  name: string
  code: string
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  phone: string | null
  email: string | null
  gstNumber: string | null
  isActive: boolean
  createdAt: Date
  plan: { id: string; name: string; durationDays: number } | null
  planExpiresAt: Date | null
  _count: { users: number; customers: number; invoices: number }
}

export function StoreTable({
  stores,
  planOverviews,
  selectedIds,
  onSelectionChange,
  activeStoreId,
  onActivate,
}: {
  stores: StoreRow[]
  planOverviews: Record<string, StorePlanOverview>
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  /** Which row's detail is showing in the panel alongside this table — distinct from selectedIds, which is the bulk-action checkbox selection. */
  activeStoreId?: string | null
  onActivate?: (id: string) => void
}) {
  const allIds = stores.map((store) => store.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id))

  function toggleAll(checked: boolean) {
    if (checked) {
      onSelectionChange(Array.from(new Set([...selectedIds, ...allIds])))
    } else {
      onSelectionChange(selectedIds.filter((id) => !allIds.includes(id)))
    }
  }

  function toggleOne(id: string, checked: boolean) {
    if (checked) {
      onSelectionChange(Array.from(new Set([...selectedIds, id])))
    } else {
      onSelectionChange(selectedIds.filter((selectedId) => selectedId !== id))
    }
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) => toggleAll(event.target.checked)}
                aria-label="Select all stores"
                className="h-4 w-4 rounded border-input"
              />
            </TableHead>
            <SortableTableHead
              label="Store"
              sortKey="name"
              defaultSortBy="createdAt"
              className="h-10 px-2 whitespace-nowrap"
            />
            <SortableTableHead
              label="Code"
              sortKey="code"
              defaultSortBy="createdAt"
              className="h-10 px-2 whitespace-nowrap"
            />
            <TableHead>City</TableHead>
            <TableHead>Users</TableHead>
            <TableHead>Parties</TableHead>
            <TableHead>Invoices</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {stores.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                No stores yet. Create the first one to get started.
              </TableCell>
            </TableRow>
          ) : (
            stores.map((store) => (
              <TableRow
                key={store.id}
                onClick={() => onActivate?.(store.id)}
                className={cn(
                  onActivate && "cursor-pointer hover:bg-accent/50",
                  activeStoreId === store.id && "bg-accent",
                )}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(store.id)}
                    onChange={(event) => toggleOne(store.id, event.target.checked)}
                    aria-label={`Select ${store.name}`}
                    className="h-4 w-4 rounded border-input"
                  />
                </TableCell>
                <TableCell>
                  <StorePlanHover
                    storeName={store.name}
                    overview={planOverviews[store.id]}
                    disableLink={Boolean(onActivate)}
                  />
                </TableCell>
                <TableCell>{store.code}</TableCell>
                <TableCell>{store.city ?? "-"}</TableCell>
                <TableCell>{store._count.users}</TableCell>
                <TableCell>{store._count.customers}</TableCell>
                <TableCell>{store._count.invoices}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
