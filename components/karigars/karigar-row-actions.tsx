"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, Pencil, Ban } from "lucide-react"

import { disableKarigar } from "@/lib/actions/karigar-actions"
import { DeleteKarigarButton } from "@/components/karigars/delete-karigar-button"
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

type KarigarRowActionsProps = {
  karigarId: string
  karigarName: string
}

export function KarigarRowActions({
  karigarId,
  karigarName,
}: KarigarRowActionsProps) {
  const router = useRouter()
  const toast = useToast()

  const [confirmDisable, setConfirmDisable] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  async function handleDisable() {
    try {
      setLoading(true)
      const result = await disableKarigar(karigarId)

      if (result.success) {
        toast.success(result.message)
        setConfirmDisable(false)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to disable karigar")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Link
          href={`/karigars/${karigarId}`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
          title="View karigar"
        >
          <Eye className="h-4 w-4" />
        </Link>

        <Link
          href={`/karigars/${karigarId}/edit`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
          title="Edit karigar"
        >
          <Pencil className="h-4 w-4" />
        </Link>

        <button
          type="button"
          onClick={() => setConfirmDisable(true)}
          className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1 text-sm text-amber-700 hover:bg-amber-50"
          title="Disable karigar"
        >
          <Ban className="h-4 w-4" />
        </button>

        <DeleteKarigarButton karigarId={karigarId} karigarName={karigarName} />
      </div>

      <Dialog
        open={confirmDisable}
        onOpenChange={(open) => {
          if (!open && !loading) setConfirmDisable(false)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disable Karigar</DialogTitle>
            <DialogDescription>
              Are you sure you want to disable{" "}
              <span className="font-medium text-foreground">{karigarName}</span>?
              <br />
              <br />
              Disabled karigars are removed from the active Karigars list, but their job
              and ledger history remains in the system. You can re-enable them any time
              from Disabled Karigars.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDisable(false)}
              disabled={loading}
            >
              Cancel
            </Button>

            <Button type="button" onClick={handleDisable} disabled={loading}>
              {loading ? (
                <>
                  <Loader className="mr-2 h-4 w-4" />
                  Disabling...
                </>
              ) : (
                "Disable Karigar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
