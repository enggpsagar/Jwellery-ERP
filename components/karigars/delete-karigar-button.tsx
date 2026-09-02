"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteKarigar } from "@/lib/actions/karigar-actions";
import { useToast } from "@/components/providers/toast-provider";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DeleteKarigarButtonProps = {
  karigarId: string;
  karigarName: string;
};

export function DeleteKarigarButton({
  karigarId,
  karigarName,
}: DeleteKarigarButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const router = useRouter();
  const toast = useToast();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteKarigar(karigarId);

      if (!result.success) {
        toast.error(result.message || "Unable to delete karigar");
        return;
      }

      toast.success(result.message || "Karigar deleted successfully");

      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="text-red-600 hover:text-red-700"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Karigar</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{karigarName}</strong>?
            <br />
            <br />
            This action cannot be undone. The karigar can only be deleted if
            they have no jobs linked to them.
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>

            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
