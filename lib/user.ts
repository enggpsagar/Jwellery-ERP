// File: src/lib/user.ts

import { UserRole, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CreateUserInput,
  UpdateUserInput,
} from "@/lib/validation/user";

export async function getUsers(storeId: string | null) {
  return prisma.user.findMany({
    where: storeId ? { storeId } : { role: UserRole.SUPER_ADMIN },
    orderBy: {
      createdAt: "desc",
    },
    select: {
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
    },
  });
}

export async function getUserById(id: string, storeId: string | null) {
  return prisma.user.findFirst({
    where: storeId ? { id, storeId } : { id, role: UserRole.SUPER_ADMIN },
  });
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
    },
  });

  return { user, claimed: false };
}

export async function updateUser(data: UpdateUserInput, storeId: string) {
  const { id, karigarId: rawKarigarId, ...payload } = data;
  const karigarId = rawKarigarId?.trim() || null;

  await assertKarigarInStore(karigarId, storeId);

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
