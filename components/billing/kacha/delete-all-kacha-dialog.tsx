"use client"

import { useState, useTransition } from "react"
import { Trash2, ShieldAlert } from "lucide-react"
import { Loader } from "@/components/ui/loader"

import {
  deleteAllKachaInvoices,
  getKachaDeleteAllSummary,
} from "@/lib/actions/kacha-invoice-actions"
import { useToast } from "@/components/providers/toast-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Summary = Awaited<ReturnType<typeof getKachaDeleteAllSummary>>

const CONFIRM_WORD = "DELETE"

/**
 * Single-click entry point to wipe every Kacha slip — gated behind a
 * summary of what will actually go.
 *
 * The counts are loaded when the dialog opens rather than passed in as
 * props, so a stale page render can never under-report how much is about
 * to be destroyed. Converted and paid slips are called out separately
 * because, unlike the per-slip delete, this operation does not spare them.
 */
export function DeleteAllKachaDialog({
  selectedIds = [],
}: {
  /** Ticked rows. Empty means the whole store, the original behaviour. */
  selectedIds?: string[]
}) {
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [confirmText, setConfirmText] = useState("")
  const [loading, startLoad] = useTransition()
  const [pending, startDelete] = useTransition()
  const toast = useToast()

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    setConfirmText("")

    if (next) {
      setSummary(null)
      startLoad(async () => setSummary(await getKachaDeleteAllSummary(selectedIds)))
    }
  }

  const handleDelete = () => {
    startDelete(async () => {
      const result = await deleteAllKachaInvoices(selectedIds)

      if (result.success) {
        toast.success(result.message)
        setOpen(false)
      } else {
        toast.error(result.message)
      }
    })
  }

  const noBackupEmail = summary !== null && !summary.backupEmail
  const nothingToDelete = summary !== null && summary.total === 0
  const canDelete =
    summary !== null &&
    !noBackupEmail &&
    !nothingToDelete &&
    confirmText.trim().toUpperCase() === CONFIRM_WORD

  return (
    <>
      <Button variant="destructive" onClick={() => handleOpenChange(true)}>
        <Trash2 className="mr-1 h-4 w-4" />
        {selectedIds.length ? `Delete ${selectedIds.length} selected` : "Delete all"}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedIds.length
                ? `Delete ${selectedIds.length} selected Kacha slip${selectedIds.length === 1 ? "" : "s"}`
                : "Delete all Kacha slips"}
            </DialogTitle>
            <DialogDescription>
              A backup is emailed first. If that email does not send, nothing
              is deleted.
            </DialogDescription>
          </DialogHeader>

          {loading || summary === null ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader className="h-4 w-4" />
              Checking what would be deleted...
            </div>
          ) : (
            <div className="space-y-4">
              <dl className="divide-y rounded-md border text-sm">
                <div className="flex justify-between px-3 py-2">
                  <dt className="text-muted-foreground">Slips to delete</dt>
                  <dd className="font-semibold tabular-nums">{summary.total}</dd>
                </div>
                <div className="flex justify-between px-3 py-2">
                  <dt className="text-muted-foreground">
                    Already converted to Pakka
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {summary.converted}
                  </dd>
                </div>
                <div className="flex justify-between px-3 py-2">
                  <dt className="text-muted-foreground">With payments recorded</dt>
                  <dd className="font-semibold tabular-nums">
                    {summary.withPayments}
                  </dd>
                </div>
                <div className="flex justify-between px-3 py-2">
                  <dt className="text-muted-foreground">Backup goes to</dt>
                  <dd className="font-medium">
                    {summary.backupEmail ?? (
                      <span className="text-destructive">Not configured</span>
                    )}
                  </dd>
                </div>
              </dl>

              {noBackupEmail && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  Set a backup email in Settings before deleting. Without one
                  there is nowhere to send the backup, so the delete cannot run.
                </p>
              )}

              {nothingToDelete && (
                <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                  There are no Kacha slips to delete.
                </p>
              )}

              {!noBackupEmail && !nothingToDelete && (
                <>
                  {(summary.converted > 0 || summary.withPayments > 0) && (
                    <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <p className="text-amber-900 dark:text-amber-200">
                        This includes converted and paid slips, which the
                        per-slip delete refuses to touch. Converted slips are
                        the record of how a Pakka invoice came about — once
                        deleted, only the emailed backup holds that history.
                      </p>
                    </div>
                  )}

                  <div className="space-y-1.5 rounded-lg transition-colors focus-within:bg-accent/40">
                    <Label htmlFor="confirm-delete-all" required>
                      Type {CONFIRM_WORD} to confirm
                    </Label>
                    <Input
                      id="confirm-delete-all"
                      value={confirmText}
                      onChange={(event) => setConfirmText(event.target.value)}
                      autoComplete="off"
                      placeholder={CONFIRM_WORD}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!canDelete || pending}
            >
              {pending && <Loader className="mr-1 h-4 w-4" />}
              {pending ? "Backing up..." : "Back up and delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
