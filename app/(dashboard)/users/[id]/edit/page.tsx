import type { Metadata } from "next";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/auth";
import { getEffectiveStoreId } from "@/lib/store-context";
import { PageBackHeader } from "@/components/shared/page-back-header";
import { UserFormDialog } from "@/components/users/user-form-dialog";
import { UserStoreAccess } from "@/components/users/user-store-access";
import { getUserStoreAccess } from "@/lib/actions/user-membership-actions";

type EditUserPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

// Scoped by store, not just id — a bare findUnique would let one store's
// owner open a user belonging to another store. Shared with generateMetadata
// below (via cache()) so the row is fetched once per request, not twice.
const getUser = cache(async (id: string, storeId: string | null) => {
  return prisma.user.findFirst({
    where: { id, ...(storeId ? { storeId } : {}) },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      isActive: true,
      karigarId: true,
      permissions: true,
      locationAccess: { select: { locationId: true } },
    },
  });
});

export async function generateMetadata({
  params,
}: EditUserPageProps): Promise<Metadata> {
  try {
    const { id } = await params;
    const storeId = await getEffectiveStoreId();
    const user = await getUser(id, storeId);
    return { title: user ? `Edit ${user.name}` : "Edit User" };
  } catch {
    return { title: "Edit User" };
  }
}

export default async function EditUserPage({ params }: EditUserPageProps) {
  const { id } = await params;
  const currentUser = await getCurrentUser();

  // Same gate as the Users list: only a Store Owner or Super Admin manages
  // users, and the URL is reachable directly so it is enforced here too.
  if (
    currentUser?.role !== UserRole.ADMIN &&
    currentUser?.role !== UserRole.SUPER_ADMIN
  ) {
    redirect("/profile");
  }

  const storeId = await getEffectiveStoreId();

  const [user, karigars, locations] = await Promise.all([
    getUser(id, storeId),
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

  if (!user) notFound();

  // Which stores this person works in. Super Admin only — a store's own Admin
  // manages people inside their store through the form above, and the action
  // enforces the same rule server-side.
  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const storeAccess = isSuperAdmin ? await getUserStoreAccess(id) : [];

  return (
    <main className="space-y-6 p-6">
      <PageBackHeader
        title={`Edit ${user.name}`}
        description="Update this user's role, access and login details."
        backHref="/users"
        backLabel="Back to Users"
      />

      <UserFormDialog
        asPage
        mode="edit"
        user={user}
        karigars={karigars}
        locations={locations}
        allowSuperAdmin={isSuperAdmin}
      />

      {isSuperAdmin && user.role !== UserRole.SUPER_ADMIN && (
        <UserStoreAccess userId={user.id} rows={storeAccess} />
      )}
    </main>
  );
}
