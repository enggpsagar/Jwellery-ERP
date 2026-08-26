import { UserRole } from "@prisma/client";

import { sendMail } from "@/lib/mailer";
import { inviteUserEmail } from "@/lib/email-templates";
import { ROLE_LABELS } from "@/lib/roles";

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
