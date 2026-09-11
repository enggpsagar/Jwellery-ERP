"use client";

import Link from "next/link";
import { Pencil, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import {
  disableUserAction,
  enableUserAction,
  deleteUserAction,
} from "@/app/(dashboard)/users/actions";

import type { UserStatus } from "@prisma/client";

type ActionableUser = {
  id: string;
  name: string | null;
  status: UserStatus;
};

/**
 * Edit/enable-disable/delete for one user row — shared by the list table
 * and the inline detail panel so both stay in sync with the same actions.
 */
export function UserRowActions({ user }: { user: ActionableUser }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const handleToggleStatus = () => {
    startTransition(async () => {
      try {
        const result =
          user.status === "DISABLED"
            ? await enableUserAction(user.id)
            : await disableUserAction(user.id);

        if (!result.success) {
          toast.error(result.message);
          return;
        }

        toast.success(result.message);
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Something went wrong",
        );
      }
    });
  };

  const handleDelete = () => {
    if (!confirm(`Delete ${user.name ?? "this user"}? This cannot be undone.`)) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await deleteUserAction(user.id);

        if (!result.success) {
          toast.error(result.message);
          return;
        }

        toast.success(result.message);
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Something went wrong",
        );
      }
    });
  };

  return (
    <div className="flex justify-end gap-1">
      {/* Editing is a full page now, not a popup — the form carries role,
          module access and location grants, which is more than a dialog
          should hold. */}
      <Button
        size="icon"
        variant="edit"
        title="Edit user"
        asChild
      >
        <Link href={`/users/${user.id}/edit`}>
          <Pencil className="h-4 w-4" />
        </Link>
      </Button>

      <Button
        variant="warning"
        size="icon"
        disabled={isPending}
        onClick={handleToggleStatus}
        title={user.status === "DISABLED" ? "Enable user" : "Disable user"}
      >
        {user.status === "DISABLED" ? (
          <ToggleLeft className="h-4 w-4" />
        ) : (
          <ToggleRight className="h-4 w-4" />
        )}
      </Button>

      <Button
        variant="destructive"
        size="icon"
        disabled={isPending}
        onClick={handleDelete}
        title="Delete user"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
