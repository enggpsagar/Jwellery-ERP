import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { inviteUserEmail } from "@/lib/email-templates";
import { ROLE_LABELS } from "@/lib/roles";

/**
 * The business name a store has set on its own Settings page, falling
 * back to a generic label for a store that hasn't visited Settings yet.
 */
export async function resolveStoreName(storeId: string): Promise<string> {
  const settings = await prisma.businessSettings.findUnique({
    where: { storeId },
    select: { businessName: true },
  });

  return settings?.businessName || "your store";
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
