"use client"

import { useState, useTransition } from "react"
import { Plus, Loader2 } from "lucide-react"

import {
  quickAddVendorForPurchase,
  type PurchaseFormVendor,
} from "@/lib/actions/purchase-actions"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type QuickAddVendorDialogProps = {
  onCreated: (vendor: PurchaseFormVendor) => void
}

/**
 * Create a vendor without leaving purchase entry. Deliberately not a
 * <form>: this renders inside the purchase <form>, and nesting forms is
 * invalid HTML — the browser drops the inner one and Enter would submit the
 * purchase instead. Fields are read from local state and the action is
 * called directly.
 */
export function QuickAddVendorDialog({ onCreated }: QuickAddVendorDialogProps) {
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [values, setValues] = useState({
    name: "",
    phone: "",
    gstNumber: "",
    city: "",
  })
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  const reset = () => {
    setValues({ name: "", phone: "", gstNumber: "", city: "" })
    setErrors({})
  }

  const handleSave = () => {
    const formData = new FormData()
    Object.entries(values).forEach(([key, value]) => formData.set(key, value))

    startTransition(async () => {
      const result = await quickAddVendorForPurchase(formData)

      if (result.success && result.vendor) {
        toast.success(result.message)
        onCreated(result.vendor)
        setOpen(false)
        reset()
      } else {
        setErrors(result.errors ?? {})
        toast.error(result.message)
      }
    })
  }

  const field = (key: keyof typeof values) => ({
    value: values[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues((prev) => ({ ...prev, [key]: event.target.value }))
      setErrors((prev) => ({ ...prev, [key]: [] }))
    },
  })

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1 h-4 w-4" />
        New vendor
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New vendor</DialogTitle>
            <DialogDescription>
              Added to your vendor list and selected for this purchase. You can
              fill in the rest on the Vendors page later.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="quick-vendor-name">Vendor name *</Label>
              <Input id="quick-vendor-name" {...field("name")} autoFocus />
              {errors.name?.[0] && (
                <p className="text-sm text-destructive">{errors.name[0]}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quick-vendor-phone">Phone *</Label>
              <Input id="quick-vendor-phone" {...field("phone")} />
              {errors.phone?.[0] && (
                <p className="text-sm text-destructive">{errors.phone[0]}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quick-vendor-gst">GSTIN</Label>
                <Input id="quick-vendor-gst" {...field("gstNumber")} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quick-vendor-city">City</Label>
                <Input id="quick-vendor-city" {...field("city")} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={pending}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Save vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
