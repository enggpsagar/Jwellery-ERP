// File: src/components/users/users-client.tsx

"use client";

import { UserTable } from "@/components/users/user-table";
import { UserFormDialog } from "@/components/users/user-form-dialog";
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
}

interface KarigarOption {
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
  allowSuperAdmin: boolean;
  pagination: Pagination;
}

export function UsersClient({
  users,
  karigars,
  allowSuperAdmin,
  pagination,
}: UsersClientProps) {
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

        <UserFormDialog
          mode="create"
          karigars={karigars}
          allowSuperAdmin={allowSuperAdmin}
        />
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

      <div className="space-y-3">
        <UserTable users={users} karigars={karigars} allowSuperAdmin={allowSuperAdmin} />

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
    </div>
  );
}
