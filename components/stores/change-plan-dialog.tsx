"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CreditCard, Loader2 } from "lucide-react"

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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-accent"
        aria-label={`Change plan for ${storeName}`}
        title="Change plan"
      >
        <CreditCard className="h-4 w-4" />
      </button>

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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
