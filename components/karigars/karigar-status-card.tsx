"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Ban, RotateCcw } from "lucide-react"

import { disableKarigar, enableKarigar } from "@/lib/actions/karigar-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader } from "@/components/ui/loader"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/providers/toast-provider"

/** The Status card on a karigar's detail page — shows Active/Disabled and,
 *  right next to it, the one action to flip it, so managing status doesn't
 *  require going back to the list and finding the row-action icon. */
export function KarigarStatusCard({
  karigarId,
  karigarName,
  isActive,
}: {
  karigarId: string
  karigarName: string
  isActive: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  async function handleToggle() {
    try {
      setLoading(true)
      const result = isActive ? await disableKarigar(karigarId) : await enableKarigar(karigarId)

      if (result.success) {
        toast.success(result.message)
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error(isActive ? "Failed to disable karigar" : "Failed to re-enable karigar")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Status</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-2">
          <Badge variant={isActive ? "secondary" : "outline"}>
            {isActive ? "Active" : "Disabled"}
          </Badge>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
            {isActive ? <Ban className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
            {isActive ? "Disable" : "Enable"}
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !loading) setOpen(false)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isActive ? "Disable Karigar" : "Enable Karigar"}</DialogTitle>
            <DialogDescription>
              {isActive ? (
                <>
                  Disable <span className="font-medium text-foreground">{karigarName}</span>?
                  They&apos;ll be removed from the active Karigars list, but their job and
                  ledger history stays intact — you can re-enable them any time from Disabled
                  Karigars.
                </>
              ) : (
                <>
                  Re-enable <span className="font-medium text-foreground">{karigarName}</span> and
                  bring them back to the active Karigars list?
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" onClick={handleToggle} disabled={loading}>
              {loading ? (
                <>
                  <Loader className="mr-2 h-4 w-4" />
                  {isActive ? "Disabling..." : "Enabling..."}
                </>
              ) : isActive ? (
                "Disable Karigar"
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
