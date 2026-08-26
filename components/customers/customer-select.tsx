"use client"

import { useMemo, useState } from "react"
import { UserPlus } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { QuickAddCustomerDialog } from "@/components/customers/quick-add-customer-dialog"

/**
 * Sentinel for the "Create new customer" row. A real SelectItem rather than
 * a plain <button> inside SelectContent: Radix owns pointer handling there
 * and can swallow a bare button's click, and a button is not reachable by
 * arrow keys in the item list. Cannot collide with a customer id — cuids.
 */
const ADD_NEW_VALUE = "__add_new_customer__"

export type CustomerOption = {
  id: string
  name: string
  phone?: string | null
  customerCode?: string | null
}

type CustomerSelectProps = {
  customers: CustomerOption[]
  name?: string
  defaultValue?: string
  placeholder?: string
  onChange?: (customerId: string, customer: CustomerOption | undefined) => void
}

/**
 * Client-side searchable customer picker, mirrors ProductSelect
 * (components/inventory/shared/product-select.tsx). Renders a hidden
 * <input name="..."> so it drops straight into a server-action form.
 */
export function CustomerSelect({
  customers,
  name = "customerId",
  defaultValue,
  placeholder = "Select a customer",
  onChange,
}: CustomerSelectProps) {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState(defaultValue ?? "")
  const [localCustomers, setLocalCustomers] = useState(customers)
  const [selectOpen, setSelectOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return localCustomers

    return localCustomers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(query) ||
        (customer.phone ?? "").toLowerCase().includes(query) ||
        (customer.customerCode ?? "").toLowerCase().includes(query),
    )
  }, [localCustomers, search])

  function selectCustomer(customer: CustomerOption) {
    setSelected(customer.id)
    onChange?.(customer.id, customer)
  }

  function openQuickAdd() {
    setSelectOpen(false)
    setQuickAddOpen(true)
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selected} />

      <Select
        value={selected}
        open={selectOpen}
        onOpenChange={setSelectOpen}
        onValueChange={(value) => {
          if (value === ADD_NEW_VALUE) {
            // Not a selection — leave `selected` alone so dismissing the
            // dialog keeps whatever was already chosen.
            openQuickAdd()
            return
          }

          setSelected(value)
          onChange?.(value, localCustomers.find((customer) => customer.id === value))
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent>
          <div className="p-2">
            <Input
              placeholder="Search by name or phone..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No customers found{search ? ` for "${search}"` : ""}
            </div>
          ) : (
            filtered.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.name}{" "}
                {customer.phone ? (
                  <span className="text-muted-foreground">({customer.phone})</span>
                ) : null}
              </SelectItem>
            ))
          )}

          {/* Outside the empty/non-empty branch above, so it is offered even
              when the store has no customers at all. */}
          <div className="my-1 border-t" />
          <SelectItem value={ADD_NEW_VALUE} className="font-medium text-primary">
            <UserPlus className="mr-1 h-4 w-4" />
            Create new customer
          </SelectItem>
        </SelectContent>
      </Select>

      {/*
        A store with no customers at all can't discover the "Create new
        customer" item above: it only exists once the dropdown is open, at
        the bottom of an otherwise empty list. On a brand new store — which
        is exactly when you must create a customer before you can bill
        anyone — the way forward has to be visible without opening
        anything. Keyed off the full list, not `filtered`, so it appears
        only for a genuinely empty store rather than every no-match search.
      */}
      {localCustomers.length === 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-dashed px-3 py-2">
          <span className="text-sm text-muted-foreground">
            No customers yet.
          </span>
          <button
            type="button"
            onClick={() => setQuickAddOpen(true)}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add your first customer
          </button>
        </div>
      )}

      <QuickAddCustomerDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        initialName={search}
        onCreated={(customer) => {
          setLocalCustomers((prev) => [customer, ...prev])
          selectCustomer(customer)
          setSearch("")
        }}
      />
    </div>
  )
}
