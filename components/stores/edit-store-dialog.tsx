"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Store as StoreIcon, Mail, Phone, MapPin, Hash } from "lucide-react"

import { updateStore, type StoreFormState } from "@/lib/actions/store-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/providers/toast-provider"

const initialState: StoreFormState = { success: false, message: "", errors: {} }

type EditStoreDialogProps = {
  store: {
    id: string
    name: string
    code: string
    address: string | null
    city: string | null
    state: string | null
    pincode: string | null
    phone: string | null
    email: string | null
    gstNumber: string | null
  }
}

export function EditStoreDialog({ store }: EditStoreDialogProps) {
  const router = useRouter()
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const [open, setOpen] = useState(false)

  const updateAction = updateStore.bind(null, store.id)
  const [state, formAction, pending] = useActionState(updateAction, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Store updated")
      setOpen(false)
      router.refresh()
      return
    }

    if (!state.success && state.message) {
      toast.error(state.message)
    }
  }, [state, router, toast])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-accent"
        aria-label={`Edit ${store.name}`}
        title="Edit store"
      >
        <Pencil className="h-4 w-4" />
      </button>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Store</DialogTitle>
        </DialogHeader>

        <form
          ref={formRef}
          action={formAction}
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <StoreIcon className="h-4 w-4 text-gray-500" />
              Store Name <span className="text-red-500">*</span>
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

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-gray-500" />
              Store Code <span className="text-red-500">*</span>
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

          <div className="space-y-1 md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-gray-500" />
              Address
            </label>
            <input
              name="address"
              defaultValue={store.address ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">City</label>
            <input
              name="city"
              defaultValue={store.city ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">State</label>
            <input
              name="state"
              defaultValue={store.state ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Pincode</label>
            <input
              name="pincode"
              defaultValue={store.pincode ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">GST Number</label>
            <input
              name="gstNumber"
              defaultValue={store.gstNumber ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Phone className="h-4 w-4 text-gray-500" />
              Phone
            </label>
            <input
              name="phone"
              type="tel"
              defaultValue={store.phone ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Mail className="h-4 w-4 text-gray-500" />
              Email
            </label>
            <input
              name="email"
              type="email"
              defaultValue={store.email ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>

            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
