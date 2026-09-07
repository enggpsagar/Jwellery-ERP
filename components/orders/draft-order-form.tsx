"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"

import {
  createDraftOrder,
  type DraftOrderFormState,
  type DraftOrderItemInput,
} from "@/lib/actions/draft-order-actions"
import { CustomerSelect, type CustomerOption } from "@/components/customers/customer-select"
import { LocationSelect, type LocationOption } from "@/components/shared/location-select"
import { PURITY_SELECT_OPTIONS } from "@/lib/purity"
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions"
import { useToast } from "@/components/providers/toast-provider"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RequiredMark } from "@/components/shared/required-mark"

const initialState: DraftOrderFormState = { success: false, message: "" }

type ItemRow = DraftOrderItemInput & { key: string }

// `key` defaults to a fresh UUID for every "Add Item" click (client-only,
// safe to randomize), but the very first row is seeded once from
// useState's initializer, which runs during SSR *and* again on the
// client's first render — two different crypto.randomUUID() values for
// the same row caused a hydration mismatch. The initial call passes a
// fixed key instead so server and client agree.
function emptyItem(key: string = crypto.randomUUID()): ItemRow {
  return {
    key,
    itemName: "",
    metalTypeId: "",
    purity: null,
    quantity: 1,
    estimatedWeight: null,
    estimatedRate: null,
    designNotes: "",
  }
}

type DraftOrderFormProps = {
  customers: CustomerOption[]
  metals: StoreMetalRow[]
  locations?: LocationOption[]
  defaultLocationId?: string | null
}

export function DraftOrderForm({
  customers,
  metals,
  locations = [],
  defaultLocationId = null,
}: DraftOrderFormProps) {
  const router = useRouter()
  const toast = useToast()
  const [items, setItems] = useState<ItemRow[]>([emptyItem("initial")])
  const [locationId, setLocationId] = useState(defaultLocationId ?? "")

  const [state, formAction, pending] = useActionState(createDraftOrder, initialState)

  useEffect(() => {
    if (state.success && state.orderId) {
      toast.success(state.message || "Draft order created")
      router.push(`/orders/${state.orderId}`)
    } else if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev))
  }

  const itemsJson = JSON.stringify(items.map(({ key: _key, ...rest }) => rest))

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        formAction(new FormData(event.currentTarget))
      }}
      className="space-y-6"
    >
      <input type="hidden" name="itemsJson" value={itemsJson} />

      <Card>
        <CardHeader>
          <CardTitle>Customer &amp; Order Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>
              Customer <RequiredMark />
            </Label>
            <CustomerSelect customers={customers} />
          </div>
          <div className="space-y-1.5">
            <Label>Expected Date</Label>
            <Input name="expectedDate" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <LocationSelect
              locations={locations}
              name="locationId"
              defaultValue={locationId}
              onChange={setLocationId}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Notes</Label>
            <Textarea name="notes" rows={2} placeholder="Any general notes about this order" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Requested Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, index) => {
            const selectedMetal = metals.find((m) => m.id === item.metalTypeId)

            return (
              <div key={item.key} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Item {index + 1}
                  </span>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(item.key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>
                      Item Name <RequiredMark />
                    </Label>
                    <Input
                      value={item.itemName}
                      onChange={(event) => updateItem(item.key, { itemName: event.target.value })}
                      placeholder="e.g. Ring, Bangle"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Metal</Label>
                    <Select
                      value={item.metalTypeId ?? ""}
                      onValueChange={(value) =>
                        updateItem(item.key, { metalTypeId: value, purity: null })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select metal" />
                      </SelectTrigger>
                      <SelectContent>
                        {metals
                          .filter((m) => m.isActive)
                          .map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedMetal?.hasPurity && (
                    <div className="space-y-1.5">
                      <Label>Purity</Label>
                      <Select
                        value={item.purity ?? ""}
                        onValueChange={(value) =>
                          updateItem(item.key, { purity: value as DraftOrderItemInput["purity"] })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select purity" />
                        </SelectTrigger>
                        <SelectContent>
                          {PURITY_SELECT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(item.key, { quantity: Number(event.target.value) || 1 })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Estimated Weight (g)</Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      value={item.estimatedWeight ?? ""}
                      onChange={(event) =>
                        updateItem(item.key, {
                          estimatedWeight: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Estimated Rate (₹)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.estimatedRate ?? ""}
                      onChange={(event) =>
                        updateItem(item.key, {
                          estimatedRate: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Design Notes</Label>
                    <Textarea
                      rows={2}
                      value={item.designNotes ?? ""}
                      onChange={(event) =>
                        updateItem(item.key, { designNotes: event.target.value })
                      }
                      placeholder="Design description, reference image note, special instructions..."
                    />
                  </div>
                </div>
              </div>
            )
          })}

          <Button type="button" variant="ghost" onClick={addItem} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Item
          </Button>
        </CardContent>
      </Card>

      {!state.success && state.message && (
        <div className="text-sm text-red-600">{state.message}</div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating..." : "Create Draft Order"}
        </Button>
      </div>
    </form>
  )
}
