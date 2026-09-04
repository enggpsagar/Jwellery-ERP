"use client"

import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Store as StoreIcon, Mail, Phone, MapPin, Hash } from "lucide-react"

import { updateStore, type StoreFormState, type StoreDetail } from "@/lib/actions/store-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/providers/toast-provider"
import { RequiredMark } from "@/components/shared/required-mark"

const initialState: StoreFormState = { success: false, message: "", errors: {} }

type EditStoreFormProps = {
  store: StoreDetail
}

export function EditStoreForm({ store }: EditStoreFormProps) {
  const router = useRouter()
  const toast = useToast()

  const updateAction = updateStore.bind(null, store.id)
  const [state, formAction, pending] = useActionState(updateAction, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Store updated")
      router.push("/stores")
      router.refresh()
      return
    }

    if (!state.success && state.message) {
      toast.error(state.message)
    }
  }, [state, router, toast])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Store Details</CardTitle>
      </CardHeader>

      <CardContent>
        <form
          onSubmit={(event) => {
            // Deliberately not `action={formAction}` directly on the form:
            // React resets a form's uncontrolled fields once an action-bound
            // submission settles, regardless of whether the action's own
            // returned state says success or failure — so a plain validation
            // error wiped every other field the user had already typed.
            // Calling the same dispatcher by hand from a prevented submit
            // sidesteps that auto-reset while keeping identical pending/error-
            // state behavior.
            event.preventDefault()
            formAction(new FormData(event.currentTarget))
          }}
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
            <label className="flex items-center gap-2 text-sm font-medium">
              <StoreIcon className="h-4 w-4 text-muted-foreground" />
              Store Name <RequiredMark />
            </label>
            <input
              name="name"
              defaultValue={store.name}
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
            {state.errors?.name?.[0] && (
              <p className="text-sm text-red-600">{state.errors.name[0]}</p>
            )}
          </div>

          <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-muted-foreground" />
              Store Code <RequiredMark />
            </label>
            <input
              name="code"
              defaultValue={store.code}
              className="w-full rounded-md border px-3 py-2 text-sm uppercase"
              required
            />
            {state.errors?.code?.[0] && (
              <p className="text-sm text-red-600">{state.errors.code[0]}</p>
            )}
          </div>

          <div className="space-y-1 md:col-span-2 rounded-lg transition-colors focus-within:bg-accent/40">
            <label className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Address
            </label>
            <input
              name="address"
              defaultValue={store.address ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
            <label className="text-sm font-medium">City</label>
            <input
              name="city"
              defaultValue={store.city ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
            <label className="text-sm font-medium">State</label>
            <input
              name="state"
              defaultValue={store.state ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
            <label className="text-sm font-medium">Pincode</label>
            <input
              name="pincode"
              defaultValue={store.pincode ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
            <label className="text-sm font-medium">GST Number</label>
            <input
              name="gstNumber"
              defaultValue={store.gstNumber ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Phone <RequiredMark />
            </label>
            <input
              name="phone"
              type="tel"
              defaultValue={store.phone ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
            {state.errors?.phone?.[0] && (
              <p className="text-sm text-red-600">{state.errors.phone[0]}</p>
            )}
          </div>

          <div className="space-y-1 rounded-lg transition-colors focus-within:bg-accent/40">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email <RequiredMark />
            </label>
            <input
              name="email"
              type="email"
              defaultValue={store.email ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
            {state.errors?.email?.[0] && (
              <p className="text-sm text-red-600">{state.errors.email[0]}</p>
            )}
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 pt-2 border-t mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/stores")}
              disabled={pending}
            >
              Cancel
            </Button>

            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
