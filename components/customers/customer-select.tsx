"use client"

import { useMemo, useState } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"

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

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return customers

    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(query) ||
        (customer.phone ?? "").toLowerCase().includes(query) ||
        (customer.customerCode ?? "").toLowerCase().includes(query),
    )
  }, [customers, search])

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selected} />

      <Select
        value={selected}
        onValueChange={(value) => {
          setSelected(value)
          onChange?.(value, customers.find((customer) => customer.id === value))
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
              No customers found
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
        </SelectContent>
      </Select>
    </div>
  )
}
