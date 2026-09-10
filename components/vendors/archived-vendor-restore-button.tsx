"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ToggleLeft } from "lucide-react"

import { unarchiveVendor } from "@/lib/actions/vendor-actions"
import { Button } from "@/components/ui/button"
import { Loader } from "@/components/ui/loader"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/providers/toast-provider"

export function ArchivedVendorRestoreButton({
  vendorId,
  vendorName,
}: {
  vendorId: string
  vendorName: string
}) {
  const router = useRouter()
  const toast = useToast()

  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  async function handleRestore() {
    try {
      setLoading(true)
      const result = await unarchiveVendor(vendorId)

      if (result.success) {
        toast.success(result.message)
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to restore vendor")
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
        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
        onClick={() => setOpen(true)}
        title="Restore vendor"
        aria-label={`Restore ${vendorName}`}
      >
        <ToggleLeft className="h-5 w-5" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !loading) setOpen(false)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restore Vendor</DialogTitle>
            <DialogDescription>
              Restore <span className="font-medium text-foreground">{vendorName}</span>{" "}
              to the active vendor list?
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
                  <Loader className="mr-2 h-4 w-4" />
                  Restoring...
                </>
              ) : (
                "Restore Vendor"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
