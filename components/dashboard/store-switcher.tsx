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
      <SelectTrigger className="w-[200px] gap-2">
        <StoreIcon className="h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder="Select a store" />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
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
                {store.name} ({store.code})
              </SelectItem>
            ))
          )}
        </div>
      </SelectContent>
    </Select>
  )
}
