"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Hourglass } from "lucide-react"
import { Loader } from "@/components/ui/loader"

import { extendStorePlan } from "@/lib/actions/store-actions"
import { formatShortDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/providers/toast-provider"

type ExtendPlanDialogProps = {
  storeId: string
  storeName: string
  currentExpiresAt: Date | null
}

/** Super Admin courtesy extension — pushes the current plan's (including a
 *  trial's, which is just whichever plan is cheapest) expiry forward by a
 *  number of days, without changing the plan itself. A negative number is
 *  also accepted, to force a store's plan into "expired" right now for
 *  testing that behavior, instead of waiting for a real one to lapse.
 *  Mirrors ChangePlanDialog's exact interaction shape (icon trigger, single
 *  Dialog, Cancel/Confirm, toast + router.refresh() on success). */
export function ExtendPlanDialog({ storeId, storeName, currentExpiresAt }: ExtendPlanDialogProps) {
  const router = useRouter()
  const toast = useToast()

  const [open, setOpen] = React.useState(false)
  const [days, setDays] = React.useState("15")
  const [loading, setLoading] = React.useState(false)

  const parsedDays = Number(days)
  const isValid = Number.isInteger(parsedDays) && parsedDays !== 0

  async function handleConfirm() {
    if (!isValid) return

    try {
      setLoading(true)
      const result = await extendStorePlan(storeId, parsedDays)

      if (result.success) {
        toast.success(result.message)
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to extend plan")
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
        className="border-transparent bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
        onClick={() => setOpen(true)}
        aria-label={`Extend plan for ${storeName}`}
        title="Extend plan"
      >
        <Hourglass className="size-4" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !loading) setOpen(next)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Extend Plan</DialogTitle>
            <DialogDescription>
              Adds (or, with a negative number, subtracts) days from the current expiry for{" "}
              <span className="font-medium text-foreground">{storeName}</span>
              {currentExpiresAt && (
                <> (currently expires {formatShortDate(currentExpiresAt)})</>
              )}
              . Works the same whether the store is on a trial or a paid plan — the plan itself
              doesn&apos;t change, only its expiry date.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="extend-days">Days to add</Label>
            <Input
              id="extend-days"
              type="number"
              step={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Use a negative number to set this store as expired right now, for testing.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant={parsedDays < 0 ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={loading || !isValid}
            >
              {loading ? (
                <>
                  <Loader className="mr-2 h-4 w-4" />
                  {parsedDays < 0 ? "Backdating..." : "Extending..."}
                </>
              ) : parsedDays < 0 ? (
                "Set as expired"
              ) : (
                "Extend"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
