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

export type KarigarOption = {
  id: string
  name: string
  mobile?: string | null
  code?: string | null
}

type KarigarSelectProps = {
  karigars: KarigarOption[]
  name?: string
  defaultValue?: string
  placeholder?: string
  onChange?: (karigarId: string, karigar: KarigarOption | undefined) => void
}

/**
 * Client-side searchable karigar picker, mirrors VendorSelect
 * (components/vendors/vendor-select.tsx). Renders a hidden
 * <input name="..."> so it drops straight into a server-action form.
 */
export function KarigarSelect({
  karigars,
  name = "karigarId",
  defaultValue,
  placeholder = "Select an artisan",
  onChange,
}: KarigarSelectProps) {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState(defaultValue ?? "")
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return karigars

    return karigars.filter(
      (karigar) =>
        karigar.name.toLowerCase().includes(query) ||
        (karigar.mobile ?? "").toLowerCase().includes(query) ||
        (karigar.code ?? "").toLowerCase().includes(query),
    )
  }, [karigars, search])

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selected} />

      <Select
        value={selected}
        open={open}
        onOpenChange={setOpen}
        onValueChange={(value) => {
          setSelected(value)
          onChange?.(value, karigars.find((karigar) => karigar.id === value))
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent>
          <div className="p-2">
            <Input
              placeholder="Search by name or mobile..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No artisans found
            </div>
          ) : (
            filtered.map((karigar) => (
              <SelectItem key={karigar.id} value={karigar.id}>
                {karigar.name}{" "}
                {karigar.mobile ? (
                  <span className="text-muted-foreground">({karigar.mobile})</span>
                ) : null}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
