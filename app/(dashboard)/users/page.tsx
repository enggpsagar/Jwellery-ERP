// File: src/app/(dashboard)/users/page.tsx

import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { getUsers, type UserSortBy, type SortOrder } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/auth";
import { getEffectiveStoreId } from "@/lib/store-context";
import { UsersClient } from "@/components/users/users-client";

type UsersPageProps = {
  searchParams?: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    sortBy?: UserSortBy;
    sortOrder?: SortOrder;
  }>;
};

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const currentUser = await getCurrentUser();

  if (
    currentUser?.role !== UserRole.ADMIN &&
    currentUser?.role !== UserRole.SUPER_ADMIN
  ) {
    redirect("/profile");
  }

  const params = (await searchParams) ?? {};

  const page = Number(params.page || 1);
  const pageSize = Number(params.pageSize || 10);
  const search = params.search || "";
  const sortBy = params.sortBy || "createdAt";
  const sortOrder = params.sortOrder || "desc";

  const storeId = await getEffectiveStoreId();

  const [{ users, pagination }, karigars] = await Promise.all([
    getUsers(storeId, { page, pageSize, search, sortBy, sortOrder }),
    storeId
      ? prisma.karigar.findMany({
          where: { storeId, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, mobile: true, email: true },
        })
      : Promise.resolve([]),
  ]);

  const allowSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;

  return (
    <UsersClient
      users={users}
      karigars={karigars}
      allowSuperAdmin={allowSuperAdmin}
      pagination={pagination}
    />
  );
}
