"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Store as StoreIcon } from "lucide-react"

import { setActiveStoreAction } from "@/lib/actions/store-actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/providers/toast-provider"

type StoreOption = {
  isArchived?: boolean
  id: string
  name: string
  code: string
}

type StoreSwitcherProps = {
  stores: StoreOption[]
  activeStoreId: string | null
}

export function StoreSwitcher({ stores, activeStoreId }: StoreSwitcherProps) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return stores

    return stores.filter(
      (store) =>
        store.name.toLowerCase().includes(query) ||
        store.code.toLowerCase().includes(query),
    )
  }, [stores, search])

  const handleChange = (storeId: string) => {
    startTransition(async () => {
      try {
        await setActiveStoreAction(storeId)
        router.refresh()
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to switch store",
        )
      }
    })
  }

  return (
    <Select
      value={activeStoreId ?? ""}
      onValueChange={handleChange}
      disabled={isPending}
      onOpenChange={(open) => {
        if (!open) setSearch("")
      }}
    >
      {/* Pill to match the search field and account chip, with the shop icon
          in gold — this is "which shop am I in", the most consequential piece
          of state in the bar for anyone working across stores. */}
      <SelectTrigger className="h-10 w-[200px] gap-2 rounded-full border-transparent bg-muted/70 shadow-inner [&>svg]:opacity-70 [&_svg:first-child]:text-[var(--chart-2)]">
        <StoreIcon className="h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder="Select a store" />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="w-72">
        <div className="p-2">
          <Input
            placeholder="Search stores..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
          />
        </div>

        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No stores found{search ? ` for "${search}"` : ""}
            </div>
          ) : (
            filtered.map((store) => (
              <SelectItem key={store.id} value={store.id}>
                <span className="block truncate">
                  {store.name} ({store.code})
                  {store.isArchived ? (
                    <span className="ml-1.5 rounded-full border px-1.5 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
                      Archived
                    </span>
                  ) : null}
                </span>
              </SelectItem>
            ))
          )}
        </div>
      </SelectContent>
    </Select>
  )
}
