// lib/actions/api-key-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { requireRole, getCurrentUser } from "@/lib/auth/auth";
import { generateApiKey } from "@/lib/auth/api-key";
import { PERMISSIONS, type Permission } from "@/lib/permissions";

export type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  isRevoked: boolean;
  lastUsedAt: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type ApiKeyFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
  /** Set only once, on the response to a successful create — the raw key is
   * never stored and can never be fetched again after this. */
  rawKey?: string;
};

export async function listApiKeys(): Promise<ApiKeySummary[]> {
  const storeId = await requireStoreScope();

  const keys = await prisma.apiKey.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true, email: true } } },
  });

  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    permissions: key.permissions,
    isRevoked: key.isRevoked,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    createdByName: key.createdBy.name ?? key.createdBy.email ?? null,
    createdAt: key.createdAt.toISOString(),
  }));
}

export async function createApiKey(
  prevState: ApiKeyFormState,
  formData: FormData,
): Promise<ApiKeyFormState> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
    const storeId = await requireStoreScope();
    const actor = await getCurrentUser();

    const name = String(formData.get("name") || "").trim();
    // Nothing pre-checked in the UI — an Admin must explicitly opt in to
    // each permission a key gets, so the easy path is least-privilege.
    const permissions = formData
      .getAll("permissions")
      .map((value) => String(value))
      .filter((value): value is Permission =>
        (Object.values(PERMISSIONS) as string[]).includes(value),
      );

    const errors: Record<string, string[]> = {};
    if (!name) errors.name = ["A name is required so you can tell keys apart later"];
    if (permissions.length === 0) {
      errors.permissions = ["Select at least one permission"];
    }
    if (Object.keys(errors).length > 0) {
      return { success: false, message: "Please fix the form errors", errors };
    }

    if (!actor?.id) {
      return { success: false, message: "Could not determine the current user" };
    }

    const { raw, prefix, hash } = generateApiKey();

    await prisma.apiKey.create({
      data: {
        storeId,
        name,
        prefix,
        keyHash: hash,
        permissions,
        createdById: actor.id,
      },
    });

    revalidatePath("/settings/api-keys");

    return { success: true, message: "API key created", rawKey: raw };
  } catch (error) {
    console.error("createApiKey error:", error);
    return { success: false, message: "Failed to create API key" };
  }
}

export async function revokeApiKey(
  id: string,
): Promise<{ success: boolean; message: string }> {
  try {
    await requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
    const storeId = await requireStoreScope();

    const { count } = await prisma.apiKey.updateMany({
      where: { id, storeId },
      data: { isRevoked: true, revokedAt: new Date() },
    });

    if (count === 0) {
      return { success: false, message: "API key not found" };
    }

    revalidatePath("/settings/api-keys");
    return { success: true, message: "API key revoked" };
  } catch (error) {
    console.error("revokeApiKey error:", error);
    return { success: false, message: "Failed to revoke API key" };
  }
}
