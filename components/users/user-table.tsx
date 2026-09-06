
// File: src/components/users/user-table.tsx

"use client";

import Link from "next/link";
import { Pencil, Ban, CircleCheck, Trash2 } from "lucide-react";

import { RecordHoverCard } from "@/components/shared/record-hover-card";
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
import { useToast } from "@/components/providers/toast-provider";
import { SortableTableHead } from "@/components/shared/sortable-table-head";

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
  permissions?: string[] | null;
  locationAccess?: { locationId: string }[] | null;
}

interface KarigarOption {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
}

interface LocationOption {
  id: string;
  name: string;
}

interface Props {
  users: User[];
  karigars?: KarigarOption[];
  locations?: LocationOption[];
  allowSuperAdmin?: boolean;
}

export function UserTable({
  users,
  karigars = [],
  locations = [],
  allowSuperAdmin = false,
}: Props) {
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
            <SortableTableHead
              label="Name"
              sortKey="name"
              defaultSortBy="createdAt"
              className="h-10 px-2 whitespace-nowrap"
            />
            <SortableTableHead
              label="Email"
              sortKey="email"
              defaultSortBy="createdAt"
              className="h-10 px-2 whitespace-nowrap"
            />
            <TableHead>Phone</TableHead>
            <SortableTableHead
              label="Role"
              sortKey="role"
              defaultSortBy="createdAt"
              className="h-10 px-2 whitespace-nowrap"
            />
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
                <TableCell>
                  <RecordHoverCard
                    label={user.name ?? "-"}
                    href={`/users/${user.id}/edit`}
                    title={user.name ?? "Unnamed user"}
                    subtitle={ROLE_LABELS[user.role]}
                    footerLabel="Edit user"
                    sections={[
                      {
                        fields: [
                          { label: "Email", value: user.email },
                          { label: "Phone", value: user.phone },
                        ],
                      },
                      {
                        fields: [
                          { label: "Status", value: user.status },
                          { label: "Account", value: user.isActive ? "Active" : "Deactivated" },
                          {
                            label: "Added",
                            value: new Date(user.createdAt).toLocaleDateString("en-IN"),
                          },
                          {
                            // Empty means unrestricted, which is not the same
                            // as none — say so rather than showing 0.
                            label: "Locations",
                            value: user.locationAccess?.length
                              ? user.locationAccess.length
                              : "All",
                          },
                        ],
                      },
                    ]}
                  />
                </TableCell>

                <TableCell>{user.email ?? "-"}</TableCell>

                <TableCell>{user.phone ?? "-"}</TableCell>

                <TableCell>
                  <Badge variant="outline">{ROLE_LABELS[user.role]}</Badge>
                </TableCell>

                <TableCell>
                  <StatusBadge status={user.status} />
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {/* Editing is a full page now, not a popup — the form
                        carries role, module access and location grants, which
                        is more than a dialog should hold. */}
                    <Button variant="outline" size="icon" title="Edit user" asChild>
                      <Link href={`/users/${user.id}/edit`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>

                    <Button
                      variant="outline"
                      size="icon"
                      disabled={isPending}
                      onClick={() => handleToggleStatus(user)}
                      title={user.status === "DISABLED" ? "Enable user" : "Disable user"}
                    >
                      {user.status === "DISABLED" ? (
                        <CircleCheck className="h-4 w-4" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )}
                    </Button>

                    <Button
                      variant="destructive"
                      size="icon"
                      disabled={isPending}
                      onClick={() => handleDelete(user)}
                      title="Delete user"
                    >
                      <Trash2 className="h-4 w-4" />
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
