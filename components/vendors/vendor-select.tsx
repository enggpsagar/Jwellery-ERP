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

export type VendorOption = {
  id: string
  name: string
  phone?: string | null
  vendorCode?: string | null
}

type VendorSelectProps = {
  vendors: VendorOption[]
  name?: string
  defaultValue?: string
  placeholder?: string
  onChange?: (vendorId: string, vendor: VendorOption | undefined) => void
}

/**
 * Client-side searchable vendor picker, mirrors ProductSelect
 * (components/inventory/shared/product-select.tsx). Renders a hidden
 * <input name="..."> so it drops straight into a server-action form.
 */
export function VendorSelect({
  vendors,
  name = "vendorId",
  defaultValue,
  placeholder = "Select a vendor",
  onChange,
}: VendorSelectProps) {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState(defaultValue ?? "")

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return vendors

    return vendors.filter(
      (vendor) =>
        vendor.name.toLowerCase().includes(query) ||
        (vendor.phone ?? "").toLowerCase().includes(query) ||
        (vendor.vendorCode ?? "").toLowerCase().includes(query),
    )
  }, [vendors, search])

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selected} />

      <Select
        value={selected}
        onValueChange={(value) => {
          setSelected(value)
          onChange?.(value, vendors.find((vendor) => vendor.id === value))
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
              No vendors found
            </div>
          ) : (
            filtered.map((vendor) => (
              <SelectItem key={vendor.id} value={vendor.id}>
                {vendor.name}{" "}
                {vendor.phone ? (
                  <span className="text-muted-foreground">({vendor.phone})</span>
                ) : null}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
