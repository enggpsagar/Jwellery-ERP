// File: app/api/auth/otp-status/route.ts

import { NextRequest, NextResponse } from "next/server";
import { OtpPurpose } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { OTP_TTL_MS } from "@/lib/auth/otp-policy";
import { getOtpLockoutState } from "@/lib/auth/otp-lockout";

/**
 * Lets the login page reconstruct its own countdown/resend/attempts/lockout
 * state after a refresh or a revisit — nothing about an in-flight OTP is
 * ever persisted client-side beyond "which phone/email + channel was last
 * used" (see the login page's own localStorage key), so this is the one
 * place that state gets read back from. Read-only; never mutates anything.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const phoneParam = searchParams.get("phone");
  const emailParam = searchParams.get("email")?.trim().toLowerCase() || null;

  if (!phoneParam && !emailParam) {
    return NextResponse.json(
      { error: "Phone number or email is required." },
      { status: 400 },
    );
  }

  const identifier = phoneParam || emailParam!;
  const where = phoneParam ? { phone: phoneParam } : { email: emailParam! };

  const [lastCode, lockoutState] = await Promise.all([
    prisma.otpCode.findFirst({
      where: { ...where, purpose: OtpPurpose.LOGIN },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, expiresAt: true, consumedAt: true },
    }),
    getOtpLockoutState(identifier, OtpPurpose.LOGIN),
  ]);

  const now = Date.now();

  const otpActive =
    !!lastCode && !lastCode.consumedAt && lastCode.expiresAt.getTime() > now;

  const expiresInSeconds = otpActive
    ? Math.max(0, Math.ceil((lastCode!.expiresAt.getTime() - now) / 1000))
    : 0;

  // Same window as OTP_TTL_MS by design (see send-otp/route.ts's own
  // RESEND_COOLDOWN_MS comment) — derived independently here from
  // lastCode.createdAt rather than trusted equal to expiresInSeconds, so
  // this stays correct even if the two constants ever diverge.
  const resendAvailableInSeconds = lastCode
    ? Math.max(0, Math.ceil((lastCode.createdAt.getTime() + OTP_TTL_MS - now) / 1000))
    : 0;

  const lockedForSeconds = lockoutState.lockedUntil
    ? Math.max(0, Math.ceil((lockoutState.lockedUntil.getTime() - now) / 1000))
    : 0;

  return NextResponse.json({
    otpActive,
    expiresInSeconds,
    resendAvailableInSeconds,
    attemptsRemaining: lockoutState.attemptsRemaining,
    lockedForSeconds,
  });
}
