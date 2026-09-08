// lib/actions/store-collaboration-actions.ts
"use server";

import crypto from "crypto";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth/auth";
import { requireStoreScope } from "@/lib/store-context";

export type CollaborationActionState = {
  success: boolean;
  message: string;
  /** The freshly generated code — present only right after a successful
   * generateCollaborationCode call, same "returned once, then only ever
   * re-read from the DB" convention as a freshly-created API key's raw
   * value, except this one IS persisted in plaintext (see
   * Store.collaborationCode's own doc comment) so it can be re-read later
   * too, unlike an API key. */
  code?: string;
};

// Ambiguous characters (0/O, 1/I/L) excluded so the code is easy to read
// aloud/retype without mixing them up — this is meant to be spoken or typed
// by hand, not copy-pasted like an API key.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export type CollaborationGrantRow = {
  superAdminUserId: string;
  name: string | null;
  email: string | null;
  grantedAt: string;
};

export type CollaborationCodeSettings = {
  code: string | null;
  generatedAt: string | null;
  activeGrants: CollaborationGrantRow[];
};

/**
 * Store Owner's own view of their Collaboration Code — Settings >
 * Collaboration. ADMIN only (the store owner), not SUPER_ADMIN: a Super
 * Admin generating their own access code would defeat the entire point of
 * the owner controlling authorization.
 */
export async function getCollaborationCodeSettings(): Promise<CollaborationCodeSettings> {
  await requireRole(UserRole.ADMIN);
  const storeId = await requireStoreScope();

  const store = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { collaborationCode: true, collaborationCodeVersion: true, collaborationCodeGeneratedAt: true },
  });

  const grants = await prisma.storeCollaborationAccess.findMany({
    where: { storeId, grantedCodeVersion: store.collaborationCodeVersion },
    orderBy: { grantedAt: "desc" },
    select: {
      superAdminUserId: true,
      grantedAt: true,
      superAdminUser: { select: { name: true, email: true } },
    },
  });

  return {
    code: store.collaborationCode,
    generatedAt: store.collaborationCodeGeneratedAt?.toISOString() ?? null,
    activeGrants: grants.map((g) => ({
      superAdminUserId: g.superAdminUserId,
      name: g.superAdminUser.name,
      email: g.superAdminUser.email,
      grantedAt: g.grantedAt.toISOString(),
    })),
  };
}

/**
 * Overwrites the store's code and bumps its version — the version bump is
 * the actual revocation mechanism, not a separate cleanup step. Every
 * StoreCollaborationAccess row redeemed under the old code silently stops
 * counting the moment this runs (see listCollaborationGrants in
 * lib/store-membership.ts), without needing to touch those rows at all.
 */
export async function generateCollaborationCode(): Promise<CollaborationActionState> {
  try {
    await requireRole(UserRole.ADMIN);
    const storeId = await requireStoreScope();

    const code = generateCode();

    // Astronomically unlikely, but the column is globally unique — retry
    // once on the off chance of a collision rather than surfacing a raw
    // Prisma error to the store owner.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await prisma.store.update({
          where: { id: storeId },
          data: {
            collaborationCode: attempt === 0 ? code : generateCode(),
            collaborationCodeVersion: { increment: 1 },
            collaborationCodeGeneratedAt: new Date(),
          },
        });
        break;
      } catch (error: any) {
        if (error?.code === "P2002" && attempt === 0) continue;
        throw error;
      }
    }

    revalidatePath("/settings/collaboration");

    return { success: true, message: "New collaboration code generated", code };
  } catch (error) {
    console.error("generateCollaborationCode error:", error);
    return { success: false, message: "Failed to generate a new code" };
  }
}

/**
 * A SUPER_ADMIN redeeming a store owner's shared code — the only way a
 * Super Admin ever gains access to a store's business data (Store Owner
 * Authorization). Grants standing access (see listCollaborationGrants) until
 * the owner generates a new code, which silently retires this grant without
 * it ever being deleted.
 */
export async function redeemCollaborationCode(
  storeId: string,
  prevState: CollaborationActionState,
  formData: FormData,
): Promise<CollaborationActionState> {
  try {
    const user = await requireAuth();
    if (user.role !== UserRole.SUPER_ADMIN) {
      return { success: false, message: "Only a Super Admin can redeem a collaboration code." };
    }

    const rawCode = String(formData.get("code") || "").trim().toUpperCase();
    if (!rawCode) {
      return { success: false, message: "Enter the code the store owner shared with you." };
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, collaborationCode: true, collaborationCodeVersion: true },
    });
    if (!store) return { success: false, message: "Store not found" };

    if (!store.collaborationCode || store.collaborationCode !== rawCode) {
      return { success: false, message: "That code is incorrect or has been replaced by a newer one." };
    }

    await prisma.storeCollaborationAccess.upsert({
      where: { storeId_superAdminUserId: { storeId, superAdminUserId: user.id! } },
      update: { grantedCodeVersion: store.collaborationCodeVersion },
      create: {
        storeId,
        superAdminUserId: user.id!,
        grantedCodeVersion: store.collaborationCodeVersion,
      },
    });

    revalidatePath("/stores");

    return { success: true, message: `Access granted to ${store.name}` };
  } catch (error) {
    console.error("redeemCollaborationCode error:", error);
    return { success: false, message: "Failed to redeem code" };
  }
}
