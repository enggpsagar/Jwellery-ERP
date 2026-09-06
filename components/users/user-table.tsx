
// File: src/components/users/user-table.tsx

"use client";

import { RecordHoverCard } from "@/components/shared/record-hover-card";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/users/status-badge";
import { SortableTableHead } from "@/components/shared/sortable-table-head";
import { cn } from "@/lib/utils";

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
  /** Which row's detail is showing in the panel alongside this table — a separate concern from any future bulk selection. */
  activeUserId?: string | null;
  onActivate?: (id: string) => void;
}

export function UserTable({
  users,
  karigars = [],
  locations = [],
  allowSuperAdmin = false,
  activeUserId,
  onActivate,
}: Props) {
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
              <TableRow
                key={user.id}
                onClick={() => onActivate?.(user.id)}
                className={cn(
                  onActivate && "cursor-pointer hover:bg-accent/50",
                  activeUserId === user.id && "bg-accent",
                )}
              >
                <TableCell>
                  <RecordHoverCard
                    label={user.name ?? "-"}
                    href={onActivate ? undefined : `/users/${user.id}/edit`}
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

              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
