"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { RotateCcw } from "lucide-react"

import { enableKarigar } from "@/lib/actions/karigar-actions"
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

export function DisabledKarigarRestoreButton({
  karigarId,
  karigarName,
}: {
  karigarId: string
  karigarName: string
}) {
  const router = useRouter()
  const toast = useToast()

  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  async function handleEnable() {
    try {
      setLoading(true)
      const result = await enableKarigar(karigarId)

      if (result.success) {
        toast.success(result.message)
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to re-enable karigar")
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
        Enable
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !loading) setOpen(false)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enable Karigar</DialogTitle>
            <DialogDescription>
              Re-enable <span className="font-medium text-foreground">{karigarName}</span>{" "}
              and bring them back to the active Karigars list?
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

            <Button type="button" onClick={handleEnable} disabled={loading}>
              {loading ? (
                <>
                  <Loader className="mr-2 h-4 w-4" />
                  Enabling...
                </>
              ) : (
                "Enable Karigar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
