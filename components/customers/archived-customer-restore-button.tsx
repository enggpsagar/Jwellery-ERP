"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, RotateCcw } from "lucide-react"

import { unarchiveCustomer } from "@/lib/actions/customer-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/providers/toast-provider"

export function ArchivedCustomerRestoreButton({
  customerId,
  customerName,
}: {
  customerId: string
  customerName: string
}) {
  const router = useRouter()
  const toast = useToast()

  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  async function handleRestore() {
    try {
      setLoading(true)
      const result = await unarchiveCustomer(customerId)

      if (result.success) {
        toast.success(result.message)
        setOpen(false)
        // The restored row leaves this (archived-only) list — refresh
        // re-fetches it from the server rather than filtering client-side,
        // so pagination/counts stay correct too.
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to restore customer")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <RotateCcw className="h-4 w-4" />
        Restore
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !loading) setOpen(false)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restore Customer</DialogTitle>
            <DialogDescription>
              Restore <span className="font-medium text-foreground">{customerName}</span>{" "}
              to the active customer list?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>

            <Button type="button" onClick={handleRestore} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Restoring...
                </>
              ) : (
                "Restore Customer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
