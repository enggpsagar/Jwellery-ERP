"use client"

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Store as StoreIcon, User, Mail, Phone, MapPin, Hash } from "lucide-react"

import { createStoreWithAdmin, type StoreFormState } from "@/lib/actions/store-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/providers/toast-provider"

const initialState: StoreFormState = { success: false, message: "", errors: {} }

export function CreateStoreForm() {
  const router = useRouter()
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const [contactError, setContactError] = useState("")

  const [state, formAction, pending] = useActionState(createStoreWithAdmin, initialState)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formEl = event.currentTarget
    const email = (formEl.elements.namedItem("adminEmail") as HTMLInputElement)?.value.trim()
    const phone = (formEl.elements.namedItem("adminPhone") as HTMLInputElement)?.value.trim()

    if (!email && !phone) {
      event.preventDefault()
      setContactError("Provide an admin email or phone number — it's required to sign in to the Store Dashboard")
      return
    }

    setContactError("")
  }

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || "Store created")
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
          ref={formRef}
          action={formAction}
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <StoreIcon className="h-4 w-4 text-gray-500" />
              Store Name <span className="text-red-500">*</span>
            </label>
            <input
              name="name"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="e.g. Ratna Lekha Jewellers - Andheri"
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
              className="w-full rounded-md border px-3 py-2 text-sm uppercase"
              placeholder="e.g. ANDHERI"
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
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Enter store address"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">City</label>
            <input name="city" className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">State</label>
            <input name="state" className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Pincode</label>
            <input name="pincode" className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">GST Number</label>
            <input name="gstNumber" className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>

          <div className="space-y-1 md:col-span-2 border-t pt-3">
            <p className="text-sm font-semibold text-muted-foreground">
              Store Admin — they&apos;ll manage this store day to day
            </p>
            <p className="text-xs text-muted-foreground">
              Email or Phone is required — it&apos;s what the admin uses to sign in to the Store Dashboard from the login screen.
            </p>
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4 text-gray-500" />
              Admin Name <span className="text-red-500">*</span>
            </label>
            <input
              name="adminName"
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
            {state.errors?.adminName?.[0] && (
              <p className="text-sm text-red-600">{state.errors.adminName[0]}</p>
            )}
          </div>

          <div />

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Mail className="h-4 w-4 text-gray-500" />
              Admin Email <span className="text-red-500">*</span>
              <span className="font-normal text-xs text-muted-foreground">(or Phone)</span>
            </label>
            <input
              name="adminEmail"
              type="email"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Used for Google sign-in"
              onChange={() => setContactError("")}
            />
            {state.errors?.adminEmail?.[0] && (
              <p className="text-sm text-red-600">{state.errors.adminEmail[0]}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Phone className="h-4 w-4 text-gray-500" />
              Admin Phone <span className="text-red-500">*</span>
              <span className="font-normal text-xs text-muted-foreground">(or Email)</span>
            </label>
            <input
              name="adminPhone"
              type="tel"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Used for OTP sign-in"
              onChange={() => setContactError("")}
            />
          </div>

          {contactError && (
            <p className="text-sm text-red-600 md:col-span-2">{contactError}</p>
          )}

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
              {pending ? "Creating..." : "Create Store"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
