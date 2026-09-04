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
 * Sentinel value for the "Add New Location" row — mirrors ProductSelect's
 * ADD_NEW_VALUE convention. Cannot collide with a real StoreLocation id
 * (those are cuids) or with the "clear selection" sentinel below.
 */
const ADD_NEW_VALUE = "__add_new_location__"
const NONE_VALUE = "__none__"

export type LocationOption = {
  id: string
  name: string
}

type LocationSelectProps = {
  locations: LocationOption[]
  /** Omit when the caller manages the selected value itself (e.g. one row
   * of a larger array-of-objects form state) and doesn't want a duplicate
   * hidden input competing with its own submission wiring. */
  name?: string
  defaultValue?: string
  placeholder?: string
  onChange?: (locationId: string) => void
}

/**
 * Location picker used everywhere a form records where a stock/transaction
 * happened. Always offers "+ Add Location" at the bottom (same as
 * ProductSelect's "Add New Product") — most useful exactly when the list is
 * empty for the current store, but kept unconditional so it's consistently
 * available rather than only appearing on the empty state.
 */
export function LocationSelect({
  locations,
  name,
  defaultValue,
  placeholder = "Select location",
  onChange,
}: LocationSelectProps) {
  const router = useRouter()
  const [selected, setSelected] = useState(defaultValue ?? "")
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const filteredLocations = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return locations
    return locations.filter((location) => location.name.toLowerCase().includes(query))
  }, [locations, search])

  return (
    <div className="space-y-2">
      {name && <input type="hidden" name={name} value={selected} />}

      <Select
        value={selected || NONE_VALUE}
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setSearch("")
        }}
        onValueChange={(value) => {
          if (value === ADD_NEW_VALUE) {
            setOpen(false)
            router.push("/settings/locations")
            return
          }

          const next = value === NONE_VALUE ? "" : value
          setSelected(next)
          onChange?.(next)
        }}
      >
        <SelectTrigger className="h-11 w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent>
          {locations.length > 3 && (
            <div className="p-2">
              <Input
                placeholder="Search locations..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
              />
            </div>
          )}

          <SelectItem value={NONE_VALUE}>None</SelectItem>

          {filteredLocations.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No locations found{search ? ` for "${search}"` : ""}
            </div>
          ) : (
            filteredLocations.map((location) => (
              <SelectItem key={location.id} value={location.id}>
                {location.name}
              </SelectItem>
            ))
          )}

          <div className="my-1 border-t" />
          <SelectItem value={ADD_NEW_VALUE} className="font-medium text-primary">
            <Plus className="mr-1 h-4 w-4" />
            Add Location
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
