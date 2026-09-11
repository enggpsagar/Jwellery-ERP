"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CreditCard } from "lucide-react"
import { Loader } from "@/components/ui/loader"

import { assignPlanToStore } from "@/lib/actions/store-actions"
import type { PlanRow } from "@/lib/actions/plan-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/providers/toast-provider"

type ChangePlanDialogProps = {
  storeId: string
  storeName: string
  currentPlanId: string | null
  plans: PlanRow[]
}

export function ChangePlanDialog({
  storeId,
  storeName,
  currentPlanId,
  plans,
}: ChangePlanDialogProps) {
  const router = useRouter()
  const toast = useToast()

  const [open, setOpen] = React.useState(false)
  const [planId, setPlanId] = React.useState(currentPlanId ?? "")
  const [loading, setLoading] = React.useState(false)

  async function handleConfirm() {
    if (!planId) return

    try {
      setLoading(true)
      const result = await assignPlanToStore(storeId, planId)

      if (result.success) {
        toast.success(result.message)
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to assign plan")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        // Tinted-icon-button treatment, same formula the destructive variant
        // already uses (bg-destructive/10 text-destructive) — shared across
        // every action in this row (see ExtendPlanDialog, ExportStoreDataButton,
        // etc.) so they read as one consistent set.
        className="border-transparent bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700"
        onClick={() => setOpen(true)}
        aria-label={`Change plan for ${storeName}`}
        title="Change plan"
      >
        <CreditCard className="size-4" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !loading) setOpen(next)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Plan</DialogTitle>
            <DialogDescription>
              Assign or renew the subscription plan for{" "}
              <span className="font-medium text-foreground">{storeName}</span>.
              This resets the plan's start date and expiry from today, and
              re-enables sign-in immediately if the store's plan had expired.
            </DialogDescription>
          </DialogHeader>

          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a plan" />
            </SelectTrigger>
            <SelectContent>
              {plans.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.name} {plan.price > 0 ? `— ₹${plan.price}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>

            <Button type="button" onClick={handleConfirm} disabled={loading || !planId}>
              {loading ? (
                <>
                  <Loader className="mr-2 h-4 w-4" />
                  Assigning...
                </>
              ) : (
                "Assign Plan"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
