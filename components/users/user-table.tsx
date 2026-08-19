// File: src/components/users/user-table.tsx

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/users/status-badge";
import { UserFormDialog } from "@/components/users/user-form-dialog";
import { useToast } from "@/components/providers/toast-provider";

import {
  disableUserAction,
  enableUserAction,
  deleteUserAction,
} from "@/app/(dashboard)/users/actions";

import { ROLE_LABELS } from "@/lib/roles";

import type { UserRole, UserStatus } from "@prisma/client";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  isActive: boolean;
  createdAt: Date;
  karigarId?: string | null;
}

interface KarigarOption {
  id: string;
  name: string;
}

interface Props {
  users: User[];
  karigars?: KarigarOption[];
  allowSuperAdmin?: boolean;
}

export function UserTable({ users, karigars = [], allowSuperAdmin = false }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const handleToggleStatus = (user: User) => {
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

  const handleDelete = (user: User) => {
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
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-8 text-center text-muted-foreground"
              >
                No users found.
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name ?? "-"}</TableCell>

                <TableCell>{user.email ?? "-"}</TableCell>

                <TableCell>{user.phone ?? "-"}</TableCell>

                <TableCell>
                  <Badge variant="outline">{ROLE_LABELS[user.role]}</Badge>
                </TableCell>

                <TableCell>
                  <StatusBadge status={user.status} />
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <UserFormDialog
                      mode="edit"
                      user={user}
                      karigars={karigars}
                      allowSuperAdmin={allowSuperAdmin}
                    />

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleToggleStatus(user)}
                    >
                      {user.status === "DISABLED" ? "Enable" : "Disable"}
                    </Button>

                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleDelete(user)}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
