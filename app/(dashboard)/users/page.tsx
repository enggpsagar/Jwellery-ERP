// File: src/app/(dashboard)/users/page.tsx

import { getUsers } from "@/lib/user";
import { UserTable } from "@/components/users/user-table";
import { UserFormDialog } from "@/components/users/user-form-dialog";

export default async function UsersPage() {
  const users = await getUsers();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            Manage ERP users and their roles.
          </p>
        </div>

        <UserFormDialog mode="create" />
      </div>

      <UserTable users={users} />
    </div>
  );
}
