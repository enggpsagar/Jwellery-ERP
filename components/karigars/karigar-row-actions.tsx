"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, Pencil, Ban } from "lucide-react"

import { disableKarigar } from "@/lib/actions/karigar-actions"
import type { StoreMetalRow } from "@/lib/actions/taxonomy-actions"
import { DeleteKarigarButton } from "@/components/karigars/delete-karigar-button"
import { IssueMaterialDialog } from "@/components/karigars/issue-material-dialog"
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

type LocationOption = {
  id: string
  name: string
}

type KarigarRowActionsProps = {
  karigarId: string
  karigarName: string
  metals: StoreMetalRow[]
  assignedMetalTypeIds: string[]
  locations?: LocationOption[]
  defaultLocationId?: string | null
  /** Off inside the detail panel — a "View karigar" link back to the
   * page you're already looking at (inline, via this same panel) isn't
   * an action. Defaults on for the list table, where it's the only way
   * to get there. */
  showView?: boolean
  /** Off inside the detail panel, which already has its own full Issue
   * Material button — this icon-only trigger next to it would just be a
   * second way to open the same dialog. Defaults on for the list table. */
  showIssueMaterial?: boolean
}

export function KarigarRowActions({
  karigarId,
  karigarName,
  metals,
  assignedMetalTypeIds,
  locations = [],
  defaultLocationId = null,
  showView = true,
  showIssueMaterial = true,
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
      toast.error("Failed to disable artisan")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {showView && (
          <Link
            href={`/karigars/${karigarId}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
            title="View artisan"
          >
            <Eye className="h-4 w-4" />
          </Link>
        )}

        <Link
          href={`/karigars/${karigarId}/edit`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-indigo-600 hover:bg-indigo-50"
          title="Edit artisan"
        >
          <Pencil className="h-4 w-4" />
        </Link>

        {showIssueMaterial && (
          <IssueMaterialDialog
            trigger="icon"
            karigarId={karigarId}
            metals={metals}
            assignedMetalTypeIds={assignedMetalTypeIds}
            locations={locations}
            defaultLocationId={defaultLocationId}
          />
        )}

        <button
          type="button"
          onClick={() => setConfirmDisable(true)}
          className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1 text-sm text-amber-700 hover:bg-amber-50"
          title="Disable artisan"
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
            <DialogTitle>Disable Artisan</DialogTitle>
            <DialogDescription>
              Are you sure you want to disable{" "}
              <span className="font-medium text-foreground">{karigarName}</span>?
              <br />
              <br />
              Disabled artisans are removed from the active Artisans list, but their job
              and ledger history remains in the system. You can re-enable them any time
              from Disabled Artisans.
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
                "Disable Artisan"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
