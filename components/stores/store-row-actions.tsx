"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Archive, ArchiveRestore } from "lucide-react"

import { archiveStore, restoreStore } from "@/lib/actions/store-actions"
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

type StoreRowActionsProps = {
  storeId: string
  storeName: string
  isActive: boolean
}

export function StoreRowActions({
  storeId,
  storeName,
  isActive,
}: StoreRowActionsProps) {
  const router = useRouter()
  const toast = useToast()

  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  async function handleConfirm() {
    try {
      setLoading(true)
      const result = isActive
        ? await archiveStore(storeId)
        : await restoreStore(storeId)

      if (result.success) {
        toast.success(result.message)
        setConfirmOpen(false)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error(error)
      toast.error(isActive ? "Failed to archive store" : "Failed to restore store")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className={
          isActive
            ? "inline-flex h-9 w-9 items-center justify-center rounded-md border border-amber-200 text-amber-700 transition hover:bg-amber-50"
            : "inline-flex h-9 w-9 items-center justify-center rounded-md border border-emerald-200 text-emerald-700 transition hover:bg-emerald-50"
        }
        aria-label={isActive ? `Archive ${storeName}` : `Restore ${storeName}`}
        title={isActive ? "Archive store" : "Restore store"}
      >
        {isActive ? (
          <Archive className="h-4 w-4" />
        ) : (
          <ArchiveRestore className="h-4 w-4" />
        )}
      </button>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !loading) setConfirmOpen(false)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isActive ? "Archive Store" : "Restore Store"}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to {isActive ? "archive" : "restore"}{" "}
              <span className="font-medium text-foreground">{storeName}</span>?
              <br />
              <br />
              {isActive ? (
                <>
                  Archiving blocks sign-in for this store&apos;s own Admin,
                  Staff, and Karigar users going forward. Its historical
                  records remain in the system, and you can restore access
                  at any time.
                </>
              ) : (
                <>
                  Restoring lets this store&apos;s users sign in again.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>

            <Button type="button" onClick={handleConfirm} disabled={loading}>
              {loading ? (
                <>
                  <Loader className="mr-2 h-4 w-4" />
                  {isActive ? "Archiving..." : "Restoring..."}
                </>
              ) : isActive ? (
                "Archive Store"
              ) : (
                "Restore Store"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
