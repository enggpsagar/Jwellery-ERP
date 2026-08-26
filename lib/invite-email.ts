import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { inviteUserEmail, disabledAccountEmail } from "@/lib/email-templates";
import { ROLE_LABELS } from "@/lib/roles";

/**
 * The display name to use for a store in outgoing email. Prefers the
 * business name the store set on its own Settings page, then falls back to
 * `Store.name` — a required column set when the store is created — before
 * the generic label. `BusinessSettings` is only created lazily on the first
 * Settings read, so a store whose owner hasn't opened Settings yet has no
 * row at all; without the `Store.name` step every email to that store said
 * "your store" instead of naming it.
 */
export async function resolveStoreName(storeId: string): Promise<string> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      name: true,
      businessSettings: { select: { businessName: true } },
    },
  });

  return (
    store?.businessSettings?.businessName?.trim() ||
    store?.name?.trim() ||
    "your store"
  );
}

/**
 * Best-effort welcome email for a newly created user (a store's own Admin
 * included) — never throws, since a failed/skipped send shouldn't undo the
 * user/store that was just created.
 */
export async function sendInviteEmailSafely(params: {
  email: string | null;
  phone: string | null;
  name: string;
  role: UserRole;
  storeName: string;
}): Promise<boolean> {
  if (!params.email) return false;

  try {
    const loginUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/login`;

    const { subject, html } = inviteUserEmail({
      name: params.name,
      roleLabel: ROLE_LABELS[params.role],
      storeName: params.storeName,
      hasEmailLogin: true,
      hasPhoneLogin: !!params.phone,
      loginUrl,
    });

    const result = await sendMail({ to: params.email, subject, html });
    return result.sent;
  } catch (error) {
    console.error("sendInviteEmailSafely error:", error);
    return false;
  }
}

/**
 * Best-effort notice sent when a disabled account attempts to sign in —
 * never throws, since a failed/skipped send must never block the sign-in
 * rejection itself. Silently no-ops if the account has no email on file
 * (a phone-only user has nowhere for this to go).
 */
export async function sendDisabledAccountEmailSafely(params: {
  email: string | null;
  name: string;
  role: UserRole;
  storeId: string | null;
}): Promise<boolean> {
  if (!params.email) return false;

  try {
    const storeName = params.storeId ? await resolveStoreName(params.storeId) : "the platform";

    const contactInstruction =
      params.role === UserRole.SUPER_ADMIN
        ? "contact another Super Admin"
        : params.role === UserRole.ADMIN
          ? "contact the Super Admin"
          : "contact your Store Owner (Admin)";

    const { subject, html } = disabledAccountEmail({
      name: params.name,
      storeName,
      contactInstruction,
    });

    const result = await sendMail({ to: params.email, subject, html });
    return result.sent;
  } catch (error) {
    console.error("sendDisabledAccountEmailSafely error:", error);
    return false;
  }
}
