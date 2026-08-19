"use client"

import { useTransition } from "react"
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
    >
      <SelectTrigger className="w-[200px] gap-2">
        <StoreIcon className="h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder="Select a store" />
      </SelectTrigger>
      <SelectContent>
        {stores.map((store) => (
          <SelectItem key={store.id} value={store.id}>
            {store.name} ({store.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
