"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Store as StoreIcon, Globe } from "lucide-react"

import { setActiveStoreAction, clearActiveStoreAction } from "@/lib/actions/store-actions"
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

/**
 * Sentinel for "clear the selection" — a real SelectItem (not a bare
 * button) for the same reason every other sentinel row in this codebase is
 * (stock-item-select.tsx's CREATE_NEW_VALUE, product-select.tsx's
 * ADD_NEW_VALUE, ...): Radix owns pointer handling inside SelectContent and
 * can swallow a plain button's click, and as an item it stays keyboard-
 * reachable. Cannot collide with a real id — those are cuids.
 */
const GLOBAL_VALUE = "__global__"

export function StoreSwitcher({ stores, activeStoreId }: StoreSwitcherProps) {
  const router = useRouter()
  const toast = useToast()
  const { data: session } = useSession()
  // Only a Super Admin has a coherent "no store" mode — resolveActiveStoreId
  // (lib/store-membership.ts) always lands a regular multi-store user back
  // on a real membership even with the cookie cleared, so offering this to
  // anyone else would just look like a no-op.
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN"
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
        if (storeId === GLOBAL_VALUE) {
          await clearActiveStoreAction()
        } else {
          await setActiveStoreAction(storeId)
        }
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
      value={activeStoreId ?? (isSuperAdmin ? GLOBAL_VALUE : "")}
      onValueChange={handleChange}
      disabled={isPending}
      onOpenChange={(open) => {
        if (!open) setSearch("")
      }}
    >
      {/* Pill to match the search field and account chip, with the shop icon
          in gold — this is "which shop am I in", the most consequential piece
          of state in the bar for anyone working across stores. Width steps
          down on narrower screens rather than staying a fixed 200px, which
          on its own was enough to push the header into overflow on phones —
          the store name still reads fine truncated (SelectTrigger's own
          line-clamp-1 handles that), just shorter. */}
      <SelectTrigger className="h-10 w-[110px] shrink-0 gap-2 rounded-full border-transparent bg-muted/70 shadow-inner sm:w-[150px] lg:w-[200px] [&>svg]:opacity-70 [&_svg:first-child]:text-[var(--chart-2)]">
        <StoreIcon className="h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder="Select a store" />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="w-96">
        <div className="p-2">
          <Input
            placeholder="Search stores..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
          />
        </div>

        {/* Pinned above the search-filtered list (same convention as every
            other sentinel row in this codebase) so a Super Admin can always
            get back to an unscoped view — including when there's only one
            store in the list at all, which previously left no way out of it
            once selected. Super Admin only: see isSuperAdmin's own comment. */}
        {isSuperAdmin && (
          <>
            <SelectItem value={GLOBAL_VALUE} className="font-medium text-primary">
              <Globe className="mr-1 h-4 w-4" />
              All Stores (Global View)
            </SelectItem>
            <div className="my-1 border-t" />
          </>
        )}

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
