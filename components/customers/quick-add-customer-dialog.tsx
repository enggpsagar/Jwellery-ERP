"use client"

import { useActionState, useEffect, useRef } from "react"
import { User, Phone } from "lucide-react"

import { addCustomer, type CustomerFormState } from "@/lib/actions/customer-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/providers/toast-provider"
import type { CustomerOption } from "@/components/customers/customer-select"

const initialState: CustomerFormState = {
  success: false,
  message: "",
  errors: {},
}

type QuickAddCustomerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-fills Name with whatever the user had already typed into the customer search box. */
  initialName?: string
  onCreated: (customer: CustomerOption) => void
}

/**
 * A minimal, controlled "create customer" dialog (just the two fields
 * addCustomer requires) meant to be triggered from inside CustomerSelect's
 * "no customers found" state, so a missing customer never has to break the
 * flow of creating an invoice/quotation/kacha slip.
 */
export function QuickAddCustomerDialog({
  open,
  onOpenChange,
  initialName,
  onCreated,
}: QuickAddCustomerDialogProps) {
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState(addCustomer, initialState)

  useEffect(() => {
    if (state.success && state.customer) {
      toast.success(state.message || "Customer added successfully")
      onCreated(state.customer)
      onOpenChange(false)
      formRef.current?.reset()
      return
    }

    if (!state.success && state.message) {
      toast.error(state.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Customer</DialogTitle>
          <DialogDescription>
            Add the essentials now — the full profile can be filled in later
            from the Customers page.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="quick-add-name" className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Customer Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="quick-add-name"
              name="name"
              defaultValue={initialName}
              placeholder="Enter customer name"
              required
              autoFocus
            />
            {state.errors?.name?.[0] && (
              <p className="text-sm text-red-600">{state.errors.name[0]}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-add-phone" className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Phone Number <span className="text-red-500">*</span>
            </Label>
            <Input
              id="quick-add-phone"
              name="phone"
              type="tel"
              placeholder="Enter phone number"
              required
            />
            {state.errors?.phone?.[0] && (
              <p className="text-sm text-red-600">{state.errors.phone[0]}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>

            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create & Select"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
