"use client"

import Link from "next/link"
import { Pencil } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { StoreRowActions } from "@/components/stores/store-row-actions"
import { ChangePlanDialog } from "@/components/stores/change-plan-dialog"
import type { PlanRow } from "@/lib/actions/plan-actions"
import type { StorePlanOverview } from "@/lib/actions/store-plan-actions"
import { StorePlanHover } from "@/components/stores/store-plan-hover"
import { SortableTableHead } from "@/components/shared/sortable-table-head"

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

const DAY_MS = 24 * 60 * 60 * 1000

function PlanStatusBadge({ planExpiresAt }: { planExpiresAt: Date | null }) {
  if (!planExpiresAt) {
    return <Badge variant="outline">No plan</Badge>
  }

  const daysRemaining = Math.ceil((planExpiresAt.getTime() - Date.now()) / DAY_MS)

  if (daysRemaining < 0) {
    return <Badge variant="destructive">Expired</Badge>
  }

  if (daysRemaining <= 7) {
    return (
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
        Expires in {daysRemaining}d
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
      Active
    </Badge>
  )
}

export function StoreTable({
  stores,
  plans,
  planOverviews,
}: {
  stores: StoreRow[]
  plans: PlanRow[]
  planOverviews: Record<string, StorePlanOverview>
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
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
            <TableHead>Customers</TableHead>
            <TableHead>Invoices</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {stores.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                No stores yet. Create the first one to get started.
              </TableCell>
            </TableRow>
          ) : (
            stores.map((store) => (
              <TableRow key={store.id}>
                <TableCell>
                  <StorePlanHover
                    storeName={store.name}
                    overview={planOverviews[store.id]}
                  />
                </TableCell>
                <TableCell>{store.code}</TableCell>
                <TableCell>{store.city ?? "-"}</TableCell>
                <TableCell>{store._count.users}</TableCell>
                <TableCell>{store._count.customers}</TableCell>
                <TableCell>{store._count.invoices}</TableCell>
                <TableCell>
                  <Badge variant={store.isActive ? "default" : "outline"}>
                    {store.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm">{store.plan?.name ?? "-"}</span>
                    <PlanStatusBadge planExpiresAt={store.planExpiresAt} />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/stores/${store.id}/edit`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-accent"
                      aria-label={`Edit ${store.name}`}
                      title="Edit store"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <ChangePlanDialog
                      storeId={store.id}
                      storeName={store.name}
                      currentPlanId={store.plan?.id ?? null}
                      plans={plans}
                    />
                    <StoreRowActions
                      storeId={store.id}
                      storeName={store.name}
                      isActive={store.isActive}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
