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

export async function createUser(data: CreateUserInput, storeId: string) {
  const email = data.email?.trim() || null;
  const phone = data.phone?.trim() || null;
  const karigarId = data.karigarId?.trim() || null;

  if (!email && !phone) {
    throw new Error("Either email or phone is required.");
  }

  await assertKarigarInStore(karigarId, storeId);

  return prisma.user.create({
    data: {
      name: data.name,
      email,
      phone,
      role: data.role,
      status: UserStatus.INVITED,
      isActive: data.isActive,
      storeId,
      karigarId,
    },
  });
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
