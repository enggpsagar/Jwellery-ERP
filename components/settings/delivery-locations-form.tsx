"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { Truck } from "lucide-react"

import { updateDeliveryLocations, type SettingsFormState } from "@/lib/actions/settings-actions"
import type { StateOption } from "@/lib/actions/location-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader } from "@/components/ui/loader"
import { useToast } from "@/components/providers/toast-provider"

const initialState: SettingsFormState = { success: false, message: "" }

/**
 * Settings → Locations → Delivery Locations: which states the New Invoice
 * Delivery Location picker offers. None ticked = the store doesn't deliver
 * out of state, so invoices hide the field and bill intra-state (see
 * filterDeliveryStates). Saved on its own (updateDeliveryLocations).
 */
export function DeliveryLocationsForm({
  states,
  initialSelectedIds,
  canEdit,
}: {
  states: StateOption[]
  initialSelectedIds: string[]
  canEdit: boolean
}) {
  const toast = useToast()
  const [selected, setSelected] = useState<string[]>(initialSelectedIds)
  const [search, setSearch] = useState("")
  const [state, formAction, pending] = useActionState(updateDeliveryLocations, initialState)

  useEffect(() => {
    if (!state.message) return
    if (state.success) toast.success(state.message)
    else toast.error(state.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? states.filter((s) => s.name.toLowerCase().includes(query)) : states
  }, [states, search])

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-4 w-4" />
          Delivery Locations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Which states show up in the Delivery Location picker when creating an Invoice. Leave every box unchecked if
            you don't deliver out of your own state — the Delivery Location field is then hidden on invoices and every
            sale is billed as intra-state (CGST + SGST).
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Input
              placeholder="Search states..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 max-w-xs"
            />
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground" data-testid="delivery-selected-count">
                {selected.length ? `${selected.length} selected` : "None — field hidden on invoices"}
              </span>
              {selected.length > 0 && canEdit ? (
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => setSelected([])}
                >
                  Clear all
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid max-h-72 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto rounded-lg border p-3 sm:grid-cols-3">
            {visible.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={() => toggle(item.id)}
                  disabled={!canEdit}
                  className="size-4"
                />
                {item.name}
              </label>
            ))}
            {visible.length === 0 ? <p className="col-span-full text-sm text-muted-foreground">No states match.</p> : null}
          </div>

          {/* Every selected state is submitted, including ones hidden by the search box. */}
          {selected.map((id) => (
            <input key={id} type="hidden" name="allowedDeliveryStateIds" value={id} />
          ))}

          {canEdit ? (
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? <Loader className="mr-1.5 size-4" /> : null}
                Save Delivery Locations
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  )
}
