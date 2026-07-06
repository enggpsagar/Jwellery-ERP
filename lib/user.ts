// File: src/lib/user.ts

import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CreateUserInput,
  UpdateUserInput,
} from "@/lib/validation/user";

export async function getUsers() {
  return prisma.user.findMany({
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
    },
  });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
  });
}

export async function createUser(data: CreateUserInput) {
  const email = data.email?.trim() || null;
  const phone = data.phone?.trim() || null;

  if (!email && !phone) {
    throw new Error("Either email or phone is required.");
  }

  return prisma.user.create({
    data: {
      name: data.name,
      email,
      phone,
      role: data.role,
      status: UserStatus.INVITED,
      isActive: data.isActive,
    },
  });
}

export async function updateUser(data: UpdateUserInput) {
  const { id, ...payload } = data;

  return prisma.user.update({
    where: { id },
    data: {
      name: payload.name,
      email: payload.email || null,
      phone: payload.phone || null,
      role: payload.role,
      isActive: payload.isActive,
    },
  });
}

export async function disableUser(id: string) {
  return prisma.user.update({
    where: { id },
    data: {
      isActive: false,
      status: UserStatus.DISABLED,
    },
  });
}

export async function enableUser(id: string) {
  return prisma.user.update({
    where: { id },
    data: {
      isActive: true,
      status: UserStatus.ACTIVE,
    },
  });
}

export async function deleteUser(id: string) {
  return prisma.user.delete({
    where: { id },
  });
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