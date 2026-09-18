// File: src/app/api/auth/send-otp/route.ts

import { NextRequest, NextResponse } from "next/server";
import { OtpPurpose } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { generateOTP, hashOTP } from "@/lib/auth/otp";
import { sendMail } from "@/lib/mailer";
import { otpEmail } from "@/lib/email-templates";
import { resolveStoreName } from "@/lib/invite-email";
import { APP_NAME } from "@/lib/constants/app";
import { logger } from "@/lib/logger";
import { OTP_TTL_MS } from "@/lib/auth/otp-policy";
import { assertNotLocked, OtpLockedError } from "@/lib/auth/otp-lockout";

// A "Resend OTP" button has no cooldown of its own — this is what actually
// stops it being spammed (each resend is a real SMS/email send). Checked
// against whichever LOGIN-purpose code (consumed or not) for this
// phone/email was created most recently, before that row gets replaced.
// Deliberately the SAME duration as OTP_TTL_MS, and identical for both
// Mobile and Email — "Resend OTP" only ever becomes available once the
// current code has actually expired, never before and never with a
// separate per-channel wait.
const RESEND_COOLDOWN_MS = OTP_TTL_MS;

function lockedResponse(lockedUntil: Date) {
  const lockedForSeconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
  return NextResponse.json(
    {
      error: "Too many failed attempts. Please try again after 24 hours.",
      lockedForSeconds,
    },
    { status: 423 },
  );
}

// Shown instead of sending a code when the phone/email has no matching
// User row — deliberately reveals account existence (a change from this
// route's earlier anti-enumeration design) so someone isn't left waiting on
// an OTP that was never going to arrive, and so a code is never wasted /
// visible in the server log (phone path) for an address with no account.
const NO_ACCOUNT_MESSAGE = "No account is associated with this application.";

function cooldownResponse(retryAfterMs: number) {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return NextResponse.json(
    {
      error: `Please wait ${retryAfterSeconds}s before requesting another code.`,
      retryAfterSeconds,
    },
    { status: 429 },
  );
}

export async function POST(request: NextRequest) {
  try {
    const { phone, email } = await request.json();

    if (!phone && !email) {
      return NextResponse.json(
        { error: "Phone number or email is required." },
        { status: 400 }
      );
    }

    const otp = generateOTP();

    if (phone) {
      const recipient = await prisma.user.findUnique({
        where: { phone },
        select: { id: true },
      });
      if (!recipient) {
        return NextResponse.json({ error: NO_ACCOUNT_MESSAGE }, { status: 404 });
      }

      try {
        await assertNotLocked(phone, OtpPurpose.LOGIN);
      } catch (error) {
        if (error instanceof OtpLockedError) return lockedResponse(error.lockedUntil);
        throw error;
      }

      const lastCode = await prisma.otpCode.findFirst({
        where: { phone, purpose: OtpPurpose.LOGIN },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (lastCode) {
        const elapsed = Date.now() - lastCode.createdAt.getTime();
        if (elapsed < RESEND_COOLDOWN_MS) {
          return cooldownResponse(RESEND_COOLDOWN_MS - elapsed);
        }
      }

      await prisma.otpCode.deleteMany({
        where: { phone, purpose: OtpPurpose.LOGIN, consumedAt: null },
      });

      await prisma.otpCode.create({
        data: {
          phone,
          purpose: OtpPurpose.LOGIN,
          codeHash: hashOTP(otp),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      });

      // No SMS provider is wired up yet — dev-only delivery via server log.
      console.log("=================================");
      console.log("OTP:", otp);
      console.log("=================================");
    } else {
      const normalizedEmail = String(email).trim().toLowerCase();

      // Name the store the code is issued for. A Super Admin has no store
      // (`storeId` is always null) — that still gets a code, just naming
      // only the application; an unrecognized address gets no code at all.
      const recipient = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { name: true, storeId: true },
      });
      if (!recipient) {
        return NextResponse.json({ error: NO_ACCOUNT_MESSAGE }, { status: 404 });
      }

      try {
        await assertNotLocked(normalizedEmail, OtpPurpose.LOGIN);
      } catch (error) {
        if (error instanceof OtpLockedError) return lockedResponse(error.lockedUntil);
        throw error;
      }

      const lastCode = await prisma.otpCode.findFirst({
        where: { email: normalizedEmail, purpose: OtpPurpose.LOGIN },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (lastCode) {
        const elapsed = Date.now() - lastCode.createdAt.getTime();
        if (elapsed < RESEND_COOLDOWN_MS) {
          return cooldownResponse(RESEND_COOLDOWN_MS - elapsed);
        }
      }

      await prisma.otpCode.deleteMany({
        where: { email: normalizedEmail, purpose: OtpPurpose.LOGIN, consumedAt: null },
      });

      await prisma.otpCode.create({
        data: {
          email: normalizedEmail,
          purpose: OtpPurpose.LOGIN,
          codeHash: hashOTP(otp),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      });

      const { subject, html, text } = otpEmail({
        code: otp,
        appName: APP_NAME,
        storeName: recipient.storeId
          ? await resolveStoreName(recipient.storeId)
          : null,
        expiryMinutes: OTP_TTL_MS / 60_000,
        recipientName: recipient.name,
        purpose: "login",
      });

      const result = await sendMail({
        to: normalizedEmail,
        subject,
        html,
        text,
      });

      if (!result.sent) {
        console.log("=================================");
        console.log("LOGIN OTP (email send failed, dev fallback):", otp);
        console.log("=================================");
      }
    }

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully.",
      // Lets the client seed its countdown from the same number the server
      // just used, rather than a hardcoded constant that could drift from
      // OTP_TTL_MS.
      expiresInSeconds: Math.round(OTP_TTL_MS / 1000),
    });
  } catch (error) {
    logger.error("SEND OTP ERROR", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error",
      },
      {
        status: 500,
      }
    );
  }
}
