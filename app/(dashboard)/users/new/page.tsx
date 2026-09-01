import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/auth";
import { getEffectiveStoreId } from "@/lib/store-context";
import { PageBackHeader } from "@/components/shared/page-back-header";
import { UserFormDialog } from "@/components/users/user-form-dialog";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  const currentUser = await getCurrentUser();

  // Same gate as the Users list and Edit page: only a Store Owner or Super
  // Admin manages users, and the URL is reachable directly so it is enforced
  // here too.
  if (
    currentUser?.role !== UserRole.ADMIN &&
    currentUser?.role !== UserRole.SUPER_ADMIN
  ) {
    redirect("/profile");
  }

  const storeId = await getEffectiveStoreId();

  const [karigars, locations] = await Promise.all([
    storeId
      ? prisma.karigar.findMany({
          where: { storeId, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, mobile: true, email: true },
        })
      : Promise.resolve([]),
    storeId
      ? prisma.storeLocation.findMany({
          where: { storeId, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title="Add User"
        description="Create a new user and set their role and access."
        backHref="/users"
        backLabel="Back to Users"
      />

      <UserFormDialog
        asPage
        mode="create"
        karigars={karigars}
        locations={locations}
        allowSuperAdmin={isSuperAdmin}
      />
    </main>
  );
}
