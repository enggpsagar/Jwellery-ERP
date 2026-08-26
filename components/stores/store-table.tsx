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
  _count: { users: number; customers: number; invoices: number }
}

export function StoreTable({ stores }: { stores: StoreRow[] }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Store</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Users</TableHead>
            <TableHead>Customers</TableHead>
            <TableHead>Invoices</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {stores.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                No stores yet. Create the first one to get started.
              </TableCell>
            </TableRow>
          ) : (
            stores.map((store) => (
              <TableRow key={store.id}>
                <TableCell className="font-medium">{store.name}</TableCell>
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
