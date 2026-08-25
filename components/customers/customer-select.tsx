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

          <div className="mt-1 border-t p-1">
            <button
              type="button"
              onClick={openQuickAdd}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary hover:bg-accent"
            >
              <UserPlus className="h-4 w-4" />
              Create new customer
            </button>
          </div>
        </SelectContent>
      </Select>

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
