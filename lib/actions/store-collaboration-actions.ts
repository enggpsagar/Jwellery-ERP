// lib/actions/store-collaboration-actions.ts
"use server";

import crypto from "crypto";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth/auth";
import { requireStoreScope } from "@/lib/store-context";
import { logger } from "@/lib/logger";

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
    logger.error("generateCollaborationCode error", error);
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
    logger.error("redeemCollaborationCode error", error);
    return { success: false, message: "Failed to redeem code" };
  }
}

// ---------------------------------------------------------------------
// Access requests — the reverse direction of Store Owner Authorization.
// A Super Admin asks directly instead of waiting for the owner to generate
// and share a code; the owner approves or denies it from Settings >
// Collaboration. Approving grants access exactly the way redeeming a code
// does (see respondToAccessRequest), so there is still only ever one
// access-revocation mechanism regardless of which path created the grant.
// ---------------------------------------------------------------------

export type MyAccessRequestStatus = "NONE" | "PENDING" | "DENIED";

/**
 * What the CURRENT Super Admin should see on a given store's "Request
 * Access" control — whether they already have a live request in flight (or
 * a past denial) for it, so the button can say the right thing instead of
 * always offering to send a fresh request.
 */
export async function getMyAccessRequestStatus(storeId: string): Promise<MyAccessRequestStatus> {
  const user = await requireAuth();
  if (user.role !== UserRole.SUPER_ADMIN) return "NONE";

  const latest = await prisma.storeAccessRequest.findFirst({
    where: { storeId, superAdminUserId: user.id! },
    orderBy: { requestedAt: "desc" },
    select: { status: true },
  });

  if (!latest) return "NONE";
  if (latest.status === "PENDING") return "PENDING";
  if (latest.status === "DENIED") return "DENIED";
  return "NONE";
}

export type MyStoreAccessState =
  | { hasAccess: true; code: string | null }
  | { hasAccess: false; requestStatus: MyAccessRequestStatus };

/**
 * The CURRENT Super Admin's actual standing with a given store — the
 * "Request Access" control shouldn't offer to request access at all once
 * they already hold a live grant (redeemed code or an approved request);
 * it should show that store's collaboration code instead. Mirrors
 * listCollaborationGrants' own version check (lib/store-membership.ts) so
 * this agrees with what the store switcher already treats as "has access":
 * a grant only counts while grantedCodeVersion still matches the store's
 * current collaborationCodeVersion — a "Generate new code" on the owner's
 * side silently drops out of this check with no separate revoke step.
 */
export async function getMyStoreAccess(storeId: string): Promise<MyStoreAccessState> {
  const user = await requireAuth();
  if (user.role !== UserRole.SUPER_ADMIN) return { hasAccess: false, requestStatus: "NONE" };

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { collaborationCode: true, collaborationCodeVersion: true },
  });
  if (!store) return { hasAccess: false, requestStatus: "NONE" };

  const grant = await prisma.storeCollaborationAccess.findUnique({
    where: { storeId_superAdminUserId: { storeId, superAdminUserId: user.id! } },
    select: { grantedCodeVersion: true },
  });

  if (grant && grant.grantedCodeVersion === store.collaborationCodeVersion) {
    return { hasAccess: true, code: store.collaborationCode };
  }

  return { hasAccess: false, requestStatus: await getMyAccessRequestStatus(storeId) };
}

/**
 * A Super Admin asking a store's owner directly for access, instead of
 * waiting for a Collaboration Code to be shared. At most one PENDING
 * request may exist per (store, super admin) at a time — enforced here,
 * not a DB constraint, so a denied or approved request stays in history
 * rather than blocking a future re-request.
 */
export async function requestStoreAccess(
  storeId: string,
  prevState: CollaborationActionState,
  formData: FormData,
): Promise<CollaborationActionState> {
  try {
    const user = await requireAuth();
    if (user.role !== UserRole.SUPER_ADMIN) {
      return { success: false, message: "Only a Super Admin can request store access." };
    }

    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });
    if (!store) return { success: false, message: "Store not found" };

    const existingPending = await prisma.storeAccessRequest.findFirst({
      where: { storeId, superAdminUserId: user.id!, status: "PENDING" },
      select: { id: true },
    });
    if (existingPending) {
      return { success: false, message: `You already have a pending request for ${store.name}.` };
    }

    const message = String(formData.get("message") || "").trim() || null;

    await prisma.storeAccessRequest.create({
      data: { storeId, superAdminUserId: user.id!, message },
    });

    revalidatePath("/stores");
    revalidatePath("/settings/collaboration");

    return { success: true, message: `Request sent to ${store.name}'s owner` };
  } catch (error) {
    logger.error("requestStoreAccess error", error);
    return { success: false, message: "Failed to send request" };
  }
}

export type PendingAccessRequestRow = {
  id: string;
  superAdminName: string | null;
  superAdminEmail: string | null;
  message: string | null;
  requestedAt: string;
};

/**
 * The store owner's inbox — every PENDING request against their own store.
 * ADMIN only, same reasoning as getCollaborationCodeSettings: only the
 * owner decides who gets in.
 */
export async function getPendingAccessRequests(): Promise<PendingAccessRequestRow[]> {
  await requireRole(UserRole.ADMIN);
  const storeId = await requireStoreScope();

  const requests = await prisma.storeAccessRequest.findMany({
    where: { storeId, status: "PENDING" },
    orderBy: { requestedAt: "desc" },
    select: {
      id: true,
      message: true,
      requestedAt: true,
      superAdminUser: { select: { name: true, email: true } },
    },
  });

  return requests.map((r) => ({
    id: r.id,
    superAdminName: r.superAdminUser.name,
    superAdminEmail: r.superAdminUser.email,
    message: r.message,
    requestedAt: r.requestedAt.toISOString(),
  }));
}

/**
 * The store owner approving or denying one request. Approving upserts a
 * StoreCollaborationAccess grant snapshotted against the store's CURRENT
 * collaborationCodeVersion — identical mechanism to redeemCollaborationCode
 * — so a later "Generate new code" revokes this access too, same as any
 * other grant. Denying just marks the row so a future re-request isn't
 * blocked by it.
 */
export async function respondToAccessRequest(
  requestId: string,
  approve: boolean,
): Promise<CollaborationActionState> {
  try {
    const actor = await requireRole(UserRole.ADMIN);
    const storeId = await requireStoreScope();

    const request = await prisma.storeAccessRequest.findFirst({
      where: { id: requestId, storeId, status: "PENDING" },
    });
    if (!request) return { success: false, message: "Request not found or already handled" };

    if (approve) {
      const store = await prisma.store.findUniqueOrThrow({
        where: { id: storeId },
        select: { collaborationCodeVersion: true },
      });

      await prisma.$transaction([
        prisma.storeAccessRequest.update({
          where: { id: requestId },
          data: { status: "APPROVED", respondedAt: new Date(), respondedByUserId: actor.id },
        }),
        prisma.storeCollaborationAccess.upsert({
          where: { storeId_superAdminUserId: { storeId, superAdminUserId: request.superAdminUserId } },
          update: { grantedCodeVersion: store.collaborationCodeVersion },
          create: {
            storeId,
            superAdminUserId: request.superAdminUserId,
            grantedCodeVersion: store.collaborationCodeVersion,
          },
        }),
      ]);
    } else {
      await prisma.storeAccessRequest.update({
        where: { id: requestId },
        data: { status: "DENIED", respondedAt: new Date(), respondedByUserId: actor.id },
      });
    }

    revalidatePath("/settings/collaboration");

    return { success: true, message: approve ? "Access granted" : "Request denied" };
  } catch (error) {
    logger.error("respondToAccessRequest error", error);
    return { success: false, message: "Failed to respond to request" };
  }
}
