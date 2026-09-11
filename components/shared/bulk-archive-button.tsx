"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";

import { useToast } from "@/components/providers/toast-provider";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type BulkArchiveResult = {
  archivedCount: number;
  failures: { id: string; message: string }[];
};

type BulkArchiveButtonProps = {
  /** Row ids currently ticked. */
  selectedIds: string[];
  /** e.g. "store" — used for "Archive 3 stores?" and the success toast. */
  itemLabelSingular: string;
  itemLabelPlural: string;
  /** Resolves an id back to a display name for the per-row failure list. */
  getDisplayName: (id: string) => string;
  /** Runs each selected id through the same guarded single-archive action
   * the row-level Archive button uses. */
  onArchive: (ids: string[]) => Promise<BulkArchiveResult>;
  /** Clears the caller's selection state once the dialog closes, success or not. */
  onDone: () => void;
};

/**
 * Bulk "Archive" — deliberately its own component rather than reusing
 * BulkDeleteButton: archiving is reversible (see restoreStore), so the copy
 * here says that explicitly instead of BulkDeleteButton's "cannot be
 * undone" warning, which would be actively wrong for this action.
 */
export function BulkArchiveButton({
  selectedIds,
  itemLabelSingular,
  itemLabelPlural,
  getDisplayName,
  onArchive,
  onDone,
}: BulkArchiveButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BulkArchiveResult | null>(null);

  const router = useRouter();
  const toast = useToast();

  const count = selectedIds.length;
  const label = count === 1 ? itemLabelSingular : itemLabelPlural;

  const handleArchive = () => {
    startTransition(async () => {
      const outcome = await onArchive(selectedIds);
      setResult(outcome);
      router.refresh();

      if (outcome.failures.length === 0) {
        toast.success(`${outcome.archivedCount} ${label} archived`);
        setOpen(false);
        onDone();
      } else if (outcome.archivedCount === 0) {
        toast.error(`Could not archive any of the selected ${label}`);
      } else {
        toast.success(`${outcome.archivedCount} of ${count} ${label} archived`);
      }
    });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setResult(null);
      if (!result || result.failures.length === 0) onDone();
    }
  };

  if (count === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant="warning"
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <Archive className="h-4 w-4" />
        Archive Selected ({count})
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {count} {label}?</DialogTitle>
          </DialogHeader>

          {!result ? (
            <p className="text-sm text-muted-foreground">
              Are you sure you want to archive {count} selected {label}?
              <br />
              <br />
              Archived {label} are marked inactive and hidden from the active
              list — nothing is deleted, and any {itemLabelSingular} can be
              restored afterward.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {result.archivedCount} of {count} {label} archived.
              </p>
              {result.failures.length > 0 && (
                <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="font-medium text-amber-800">
                    {result.failures.length} skipped:
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5 text-amber-800">
                    {result.failures.map((failure) => (
                      <li key={failure.id}>
                        <strong>{getDisplayName(failure.id)}</strong> — {failure.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {!result ? (
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button variant="warning" onClick={handleArchive} disabled={isPending}>
                  {isPending ? "Archiving..." : "Archive"}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
