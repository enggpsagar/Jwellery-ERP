"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"

/**
 * Sentinel value for the "Add New Product" row. It is a real SelectItem rather
 * than a plain <button> inside SelectContent: Radix owns pointer handling
 * in there and can swallow a bare button's click, and as an item it is also
 * keyboard-reachable. Cannot collide with a record id — those are cuids.
 */
const ADD_NEW_VALUE = "__add_new_product__"

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
  /** When set, an "Add New Product" row appears at the bottom of the list
   * and navigates here. Opt-in, so the stock and receive-items forms that
   * only pick existing products are unaffected. */
  addNewHref?: string
  /** Runs just before navigating away, so the caller can stash state it
   * would otherwise lose. */
  onBeforeAddNew?: () => void
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
  addNewHref,
  onBeforeAddNew,
}: ProductSelectProps) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState(defaultValue ?? "")
  const [open, setOpen] = useState(false)

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
        open={open}
        onOpenChange={setOpen}
        onValueChange={(value) => {
          if (value === ADD_NEW_VALUE) {
            // Not a selection — leave `selected` untouched so the field
            // keeps whatever was already chosen if the user comes back
            // without creating anything.
            setOpen(false)
            onBeforeAddNew?.()
            if (addNewHref) router.push(addNewHref)
            return
          }

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

          {/* Rendered outside the empty/non-empty branch above, so it is
              offered whether or not the store has any products yet — creating
              the first one has to be possible from here. */}
          {addNewHref && (
            <>
              <div className="my-1 border-t" />
              <SelectItem
                value={ADD_NEW_VALUE}
                className="font-medium text-primary"
              >
                <Plus className="mr-1 h-4 w-4" />
                Add New Product
              </SelectItem>
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
