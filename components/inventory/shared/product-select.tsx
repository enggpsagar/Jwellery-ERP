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

export type ProductOption = {
  id: string
  productCode: string
  name: string
  category?: string | null
  ornamentType?: string | null
  metalType?: string | null
  defaultPurity?: string | null
  isActive: boolean
}

type ProductSelectProps = {
  products: ProductOption[]
  name?: string
  defaultValue?: string
  placeholder?: string
  onChange?: (productId: string, product: ProductOption | undefined) => void
}

/**
 * Client-side searchable product picker.
 * Renders a hidden <input name="..."> so it drops straight into a
 * server-action form the same way the other form fields do.
 */
export function ProductSelect({
  products,
  name = "productId",
  defaultValue,
  placeholder = "Select a product",
  onChange,
}: ProductSelectProps) {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState(defaultValue ?? "")

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return products

    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.productCode.toLowerCase().includes(query),
    )
  }, [products, search])

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selected} />

      <Select
        value={selected}
        onValueChange={(value) => {
          setSelected(value)
          onChange?.(value, products.find((product) => product.id === value))
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent>
          <div className="p-2">
            <Input
              placeholder="Search by name or code..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No products found
            </div>
          ) : (
            filtered.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}{" "}
                <span className="text-muted-foreground">
                  ({product.productCode})
                </span>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
