// File: src/app/(dashboard)/users/page.tsx

import { UserRole } from "@prisma/client";

import { getUsers } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/auth";
import { getEffectiveStoreId } from "@/lib/store-context";
import { UserTable } from "@/components/users/user-table";
import { UserFormDialog } from "@/components/users/user-form-dialog";

export default async function UsersPage() {
  const currentUser = await getCurrentUser();
  const storeId = await getEffectiveStoreId();

  const [users, karigars] = await Promise.all([
    getUsers(storeId),
    storeId
      ? prisma.karigar.findMany({
          where: { storeId, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const allowSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            Manage ERP users and their roles.
          </p>
        </div>

        <UserFormDialog
          mode="create"
          karigars={karigars}
          allowSuperAdmin={allowSuperAdmin}
        />
      </div>

      <UserTable users={users} karigars={karigars} allowSuperAdmin={allowSuperAdmin} />
    </div>
  );
}
