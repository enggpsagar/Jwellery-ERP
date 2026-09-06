// File: src/components/users/users-client.tsx

"use client";

import Link from "next/link";
import * as React from "react";

import { UserTable } from "@/components/users/user-table";
import { UserDetailPanel } from "@/components/users/user-detail-panel";
import { Button } from "@/components/ui/button";
import { DataTableToolbar } from "@/components/shared/data-table-toolbar";
import { DataTablePagination } from "@/components/shared/data-table-pagination";
import { exportUsersToExcel } from "@/app/(dashboard)/users/actions";

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

type Pagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

interface UsersClientProps {
  users: User[];
  karigars: KarigarOption[];
  locations: LocationOption[];
  allowSuperAdmin: boolean;
  pagination: Pagination;
}

export function UsersClient({
  users,
  karigars,
  locations,
  allowSuperAdmin,
  pagination,
}: UsersClientProps) {
  // Which row's full detail shows in the right-hand panel — defaults to
  // the first row on this page/search result so the panel is never empty
  // on load, matching the Customers/Vendors/Karigars layout this mirrors.
  const [activeUserId, setActiveUserId] = React.useState<string | null>(
    users[0]?.id ?? null,
  );

  React.useEffect(() => {
    setActiveUserId((current) => {
      if (current && users.some((user) => user.id === current)) return current;
      return users[0]?.id ?? null;
    });
  }, [users]);

  const activeUser = users.find((user) => user.id === activeUserId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            Manage ERP users and their roles. Showing {users.length} of{" "}
            {pagination.totalCount} users.
          </p>
        </div>

        <Button asChild>
          <Link href="/users/new">Add User</Link>
        </Button>
      </div>

      <DataTableToolbar
        searchPlaceholder="Search by name, email, or phone..."
        sortOptions={[
          { value: "createdAt", label: "Sort by Created Date" },
          { value: "name", label: "Sort by Name" },
          { value: "email", label: "Sort by Email" },
          { value: "role", label: "Sort by Role" },
        ]}
        defaultSortBy="createdAt"
        entityLabel="users"
        exportAction={exportUsersToExcel}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-3">
          <UserTable
            users={users}
            karigars={karigars}
            locations={locations}
            allowSuperAdmin={allowSuperAdmin}
            activeUserId={activeUserId}
            onActivate={setActiveUserId}
          />

          <div className="rounded-xl border">
            <DataTablePagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalCount={pagination.totalCount}
              pageSize={pagination.pageSize}
              itemLabel="users"
            />
          </div>
        </div>

        <UserDetailPanel user={activeUser} karigars={karigars} locations={locations} />
      </div>
    </div>
  );
}
