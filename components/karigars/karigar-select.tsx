"use client"

import { useMemo, useState } from "react"
import { Plus } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { AddKarigarDialog } from "@/components/karigars/add-karigar-dialog"

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
  /**
   * Centralizes the "+ Add Artisan" affordance here rather than making
   * every caller wire up its own button + AddKarigarDialog (there's no
   * per-caller decision to make — creating a karigar mid-flow works the
   * same everywhere this picker is used). Omit it to render a plain picker
   * with no add-new button, e.g. read-only contexts.
   *
   * The new row is NOT added to the `karigars` list internally — that list
   * is owned by the caller (usually fetched server-side), so this only
   * reports it upward; the caller pushes it into its own state and passes
   * the updated list back down, same as AddMetalDialog/AddPurityDialog's
   * own onCreated wired up in product-form.tsx.
   */
  onCreated?: (karigar: KarigarOption) => void
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
  onCreated,
}: KarigarSelectProps) {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState(defaultValue ?? "")
  const [open, setOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

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

      <div className="flex gap-2">
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

        {onCreated && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-11 w-9 shrink-0 px-0"
            title="Add Artisan"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {onCreated && (
        <AddKarigarDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onCreated={(karigar) => {
            setSelected(karigar.id)
            onChange?.(karigar.id, karigar)
            onCreated(karigar)
          }}
        />
      )}
    </div>
  )
}
