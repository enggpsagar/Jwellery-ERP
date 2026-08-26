// File: src/lib/user.ts

import { UserRole, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CreateUserInput,
  UpdateUserInput,
} from "@/lib/validation/user";

export type UserSortBy = "name" | "email" | "createdAt" | "role";
export type SortOrder = "asc" | "desc";

export type GetUsersParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: UserSortBy;
  sortOrder?: SortOrder;
};

export type UsersPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  isActive: true,
  createdAt: true,
  storeId: true,
  karigarId: true,
  permissions: true,
  store: { select: { name: true } },
  karigar: { select: { name: true } },
  locationAccess: { select: { locationId: true } },
} as const;

function getUsersWhere(storeId: string | null, search?: string) {
  const base = storeId ? { storeId } : { role: UserRole.SUPER_ADMIN };
  const query = String(search || "").trim();

  if (!query) return base;

  return {
    ...base,
    OR: [
      { name: { contains: query, mode: "insensitive" as const } },
      { email: { contains: query, mode: "insensitive" as const } },
      { phone: { contains: query, mode: "insensitive" as const } },
    ],
  };
}

function getUsersOrderBy(sortBy: UserSortBy = "createdAt", sortOrder: SortOrder = "desc") {
  if (sortBy === "name") return { name: sortOrder };
  if (sortBy === "email") return { email: sortOrder };
  if (sortBy === "role") return { role: sortOrder };
  return { createdAt: sortOrder };
}

export async function getUsers(storeId: string | null, params: GetUsersParams = {}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Number(params.pageSize || 10));
  const search = String(params.search || "").trim();
  const sortBy = params.sortBy || "createdAt";
  const sortOrder = params.sortOrder || "desc";

  const where = getUsersWhere(storeId, search);
  const orderBy = getUsersOrderBy(sortBy, sortOrder);

  const [totalCount, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: USER_SELECT,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const pagination: UsersPagination = {
    page,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };

  return { users, pagination };
}

/** Same filter/sort as getUsers, but unpaginated — used by the Excel export. */
export async function getAllUsersForExport(
  storeId: string | null,
  params: Pick<GetUsersParams, "search" | "sortBy" | "sortOrder"> = {}
) {
  const where = getUsersWhere(storeId, params.search);
  const orderBy = getUsersOrderBy(params.sortBy || "createdAt", params.sortOrder || "desc");

  return prisma.user.findMany({
    where,
    orderBy,
    select: USER_SELECT,
  });
}

export async function getUserById(id: string, storeId: string | null) {
  return prisma.user.findFirst({
    where: storeId ? { id, storeId } : { id, role: UserRole.SUPER_ADMIN },
  });
}

/** Filters a set of client-supplied location ids down to ones that actually
 * belong to this store — the same IDOR-prevention pattern used for
 * productId/metalTypeId elsewhere, so a Staff user can't be granted (or
 * grant themselves, if this ever became self-serve) access to another
 * store's location by id. */
async function validStoreLocationIds(
  locationIds: string[] | undefined,
  storeId: string
): Promise<string[]> {
  const ids = [...new Set((locationIds ?? []).filter(Boolean))];
  if (!ids.length) return [];

  const rows = await prisma.storeLocation.findMany({
    where: { id: { in: ids }, storeId },
    select: { id: true },
  });

  return rows.map((row) => row.id);
}

async function assertKarigarInStore(karigarId: string | null, storeId: string) {
  if (!karigarId) return;

  const karigar = await prisma.karigar.findFirst({
    where: { id: karigarId, storeId },
    select: { id: true },
  });

  if (!karigar) {
    throw new Error("Selected karigar was not found in this store.");
  }
}

/**
 * Signing in with Google auto-creates a User row for any email (via the
 * NextAuth adapter) with no store attached. If an Admin later tries to add
 * that same email to their store, a plain unique-constraint create would
 * fail with a confusing "already exists" error — instead, an orphaned
 * (storeless) account is claimed into the inviting store. Accounts that
 * already belong to a store, or to Super Admin, are never silently
 * reassigned — that would let one store's Admin hijack another store's user.
 */
export async function createUser(
  data: CreateUserInput,
  storeId: string
): Promise<{ user: Awaited<ReturnType<typeof prisma.user.create>>; claimed: boolean }> {
  const email = data.email?.trim() || null;
  const phone = data.phone?.trim() || null;
  const karigarId = data.karigarId?.trim() || null;

  if (!email && !phone) {
    throw new Error("Either email or phone is required.");
  }

  await assertKarigarInStore(karigarId, storeId);

  const locationIds =
    data.role === UserRole.STAFF ? await validStoreLocationIds(data.locationIds, storeId) : [];

  const existing = await prisma.user.findFirst({
    where: {
      OR: [email ? { email } : undefined, phone ? { phone } : undefined].filter(
        (clause): clause is { email: string } | { phone: string } => Boolean(clause)
      ),
    },
  });

  if (existing) {
    if (existing.role === UserRole.SUPER_ADMIN) {
      throw new Error(
        "This email belongs to a Super Admin account and can't be added as a store user."
      );
    }

    if (existing.storeId && existing.storeId === storeId) {
      throw new Error("A user with this email or phone already exists in this store.");
    }

    if (existing.storeId && existing.storeId !== storeId) {
      throw new Error("This email or phone is already associated with another store.");
    }

    // Existing account has no store yet (e.g. self-registered via Google) — claim it.
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: data.name || existing.name,
        role: data.role,
        isActive: data.isActive,
        storeId,
        karigarId,
        status: UserStatus.ACTIVE,
        permissions: data.role === UserRole.STAFF ? data.permissions : [],
        locationAccess: {
          deleteMany: {},
          create: locationIds.map((locationId) => ({ locationId })),
        },
      },
    });

    return { user, claimed: true };
  }

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email,
      phone,
      role: data.role,
      status: UserStatus.INVITED,
      isActive: data.isActive,
      storeId,
      karigarId,
      permissions: data.role === UserRole.STAFF ? data.permissions : [],
      locationAccess: { create: locationIds.map((locationId) => ({ locationId })) },
    },
  });

  return { user, claimed: false };
}

export async function updateUser(data: UpdateUserInput, storeId: string) {
  const { id, karigarId: rawKarigarId, ...payload } = data;
  const karigarId = rawKarigarId?.trim() || null;

  await assertKarigarInStore(karigarId, storeId);

  const locationIds =
    payload.role === UserRole.STAFF
      ? await validStoreLocationIds(payload.locationIds, storeId)
      : [];

  const { count } = await prisma.user.updateMany({
    where: { id, storeId },
    data: {
      name: payload.name,
      email: payload.email || null,
      phone: payload.phone || null,
      role: payload.role,
      isActive: payload.isActive,
      karigarId,
      permissions: payload.role === UserRole.STAFF ? payload.permissions : [],
    },
  });

  if (count === 0) {
    throw new Error("User not found");
  }

  // updateMany can't do nested relation writes — sync location grants
  // separately now that ownership (id + storeId) is already confirmed above.
  await prisma.$transaction([
    prisma.userLocationAccess.deleteMany({ where: { userId: id } }),
    ...(locationIds.length
      ? [
          prisma.userLocationAccess.createMany({
            data: locationIds.map((locationId) => ({ userId: id, locationId })),
          }),
        ]
      : []),
  ]);
}

export async function disableUser(id: string, storeId: string) {
  const { count } = await prisma.user.updateMany({
    where: { id, storeId },
    data: {
      isActive: false,
      status: UserStatus.DISABLED,
    },
  });

  if (count === 0) {
    throw new Error("User not found");
  }
}

export async function enableUser(id: string, storeId: string) {
  const { count } = await prisma.user.updateMany({
    where: { id, storeId },
    data: {
      isActive: true,
      status: UserStatus.ACTIVE,
    },
  });

  if (count === 0) {
    throw new Error("User not found");
  }
}

export async function deleteUser(id: string, storeId: string) {
  const { count } = await prisma.user.deleteMany({
    where: { id, storeId },
  });

  if (count === 0) {
    throw new Error("User not found");
  }
}

export async function userExistsByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
  });
}

export async function userExistsByPhone(phone: string) {
  return prisma.user.findUnique({
    where: { phone },
  });
}
