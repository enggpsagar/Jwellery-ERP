import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import {
  inviteUserEmail,
  disabledAccountEmail,
  storeArchivedEmail,
} from "@/lib/email-templates";
import { APP_NAME } from "@/lib/constants/app";
import { ROLE_LABELS } from "@/lib/roles";
import { LEGACY_PLACEHOLDER_BUSINESS_NAME } from "@/lib/constants/app";

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

  const businessName = store?.businessSettings?.businessName?.trim();

  // Settings rows created before the seeding fix carry a generic
  // placeholder, which is non-empty and so would win over the store's real
  // name — that is exactly how live stores ended up emailing under "My
  // Jewellery Store". Treat it as unset. A business name the owner actually
  // typed still takes precedence, even if it happens to match.
  const usableBusinessName =
    businessName && businessName !== LEGACY_PLACEHOLDER_BUSINESS_NAME
      ? businessName
      : null;

  return usableBusinessName || store?.name?.trim() || "your store";
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

/**
 * How long to wait before telling a store's owner again that their store is
 * archived. Every blocked sign-in reaches this, so without a cooldown a
 * locked-out user retrying ten times would send ten identical emails.
 */
const ARCHIVE_NOTICE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Tell a store's owner that someone was turned away because the store is
 * archived.
 *
 * Best-effort and never throws: this runs inside the sign-in path, and the
 * sign-in must be refused whether or not the email goes out.
 *
 * Sent to the store's Admins — the owner — not to whoever attempted. Staff
 * can do nothing about an archived store, and replying to them would confirm
 * the store's status to anyone who guesses an address.
 */
export async function sendStoreArchivedNoticeSafely(params: {
  storeId: string;
  attemptedBy?: string | null;
}): Promise<boolean> {
  try {
    const store = await prisma.store.findUnique({
      where: { id: params.storeId },
      select: { id: true, name: true, isActive: true, archiveNotifiedAt: true },
    });

    // Re-checked rather than trusted from the caller: if the store was
    // restored between the sign-in check and here, no notice is due.
    if (!store || store.isActive) return false;

    if (
      store.archiveNotifiedAt &&
      Date.now() - store.archiveNotifiedAt.getTime() < ARCHIVE_NOTICE_COOLDOWN_MS
    ) {
      return false;
    }

    const owners = await prisma.user.findMany({
      where: {
        storeId: store.id,
        role: UserRole.ADMIN,
        email: { not: null },
      },
      select: { name: true, email: true },
    });

    if (owners.length === 0) {
      console.warn(
        `Store ${store.name} is archived but has no Admin with an email — nobody to notify.`,
      );
      return false;
    }

    // Stamped before sending, not after: a send that is slow or partially
    // fails must not leave the door open for a burst of retries to each
    // queue their own email.
    await prisma.store.update({
      where: { id: store.id },
      data: { archiveNotifiedAt: new Date() },
    });

    const results = await Promise.all(
      owners.map((owner) => {
        const mail = storeArchivedEmail({
          ownerName: owner.name || "there",
          storeName: store.name,
          appName: APP_NAME,
          attemptedBy: params.attemptedBy ?? null,
        });

        return sendMail({
          to: owner.email as string,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
      }),
    );

    return results.some((result) => result.sent);
  } catch (error) {
    console.error("sendStoreArchivedNoticeSafely error:", error);
    return false;
  }
}
