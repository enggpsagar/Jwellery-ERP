"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { useToast } from "@/components/providers/toast-provider";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type BulkDeleteResult = {
  deletedCount: number;
  failures: { id: string; message: string }[];
};

type BulkDeleteButtonProps = {
  /** Row ids currently ticked. */
  selectedIds: string[];
  /** e.g. "customer" — used for "Delete 3 customers?" and the success toast. */
  itemLabelSingular: string;
  itemLabelPlural: string;
  /** Resolves an id back to a display name for the per-row failure list — the row data the table already has, not a fresh fetch. */
  getDisplayName: (id: string) => string;
  /**
   * Runs each selected id through the same guarded single-delete action the
   * row-level Delete button uses — see the bulkDeleteX() server actions
   * (customer-actions.ts, vendor-actions.ts, karigar-actions.ts,
   * product-actions.ts). Never a bare deleteMany, so a bulk selection can't
   * bypass a dependency guard just because several rows were ticked at once.
   */
  onDelete: (ids: string[]) => Promise<BulkDeleteResult>;
  /** Clears the caller's selection state once the dialog closes, success or not. */
  onDone: () => void;
};

/**
 * The one "Delete Selected (N)" control for every list table with bulk
 * selection — reused across Customers/Vendors/Karigars/Products rather
 * than each hand-rolling its own. Partial success is a first-class outcome
 * here (some rows deleted, others skipped for having real dependencies),
 * not an error state — the per-row guard that protects a single delete
 * applies exactly the same way to a batch.
 */
export function BulkDeleteButton({
  selectedIds,
  itemLabelSingular,
  itemLabelPlural,
  getDisplayName,
  onDelete,
  onDone,
}: BulkDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BulkDeleteResult | null>(null);

  const router = useRouter();
  const toast = useToast();

  const count = selectedIds.length;
  const label = count === 1 ? itemLabelSingular : itemLabelPlural;

  const handleDelete = () => {
    startTransition(async () => {
      const outcome = await onDelete(selectedIds);
      setResult(outcome);
      router.refresh();

      if (outcome.failures.length === 0) {
        toast.success(`${outcome.deletedCount} ${label} deleted`);
        setOpen(false);
        onDone();
      } else if (outcome.deletedCount === 0) {
        toast.error(`Could not delete any of the selected ${label}`);
      } else {
        toast.success(`${outcome.deletedCount} of ${count} ${label} deleted`);
      }
    });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setResult(null);
      // Only clear the caller's selection on a fully-clean run — if some
      // rows failed, they stay selected so the merchant can see exactly
      // which ones still need attention rather than losing track of them.
      if (!result || result.failures.length === 0) onDone();
    }
  };

  if (count === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 text-red-600 hover:text-red-700"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
        Delete Selected ({count})
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {count} {label}?</DialogTitle>
          </DialogHeader>

          {!result ? (
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete {count} selected {label}?
              <br />
              <br />
              This action cannot be undone. Any {itemLabelSingular} with linked
              records will be skipped rather than deleted.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {result.deletedCount} of {count} {label} deleted.
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
                <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                  {isPending ? "Deleting..." : "Delete"}
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
