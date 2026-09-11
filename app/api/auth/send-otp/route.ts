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

const OTP_TTL_MS = 5 * 60 * 1000;

// A "Resend OTP" button has no cooldown on its own — this is what actually
// stops it being spammed (each resend is a real SMS/email send). Checked
// against whichever LOGIN-purpose code (consumed or not) for this
// phone/email was created most recently, before that row gets replaced.
// Phone gets a longer window than email — an SMS is slower to arrive and
// costs more per send than an email does.
const PHONE_RESEND_COOLDOWN_MS = 2 * 60 * 1000;
const EMAIL_RESEND_COOLDOWN_MS = 30 * 1000;

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

      const lastCode = await prisma.otpCode.findFirst({
        where: { phone, purpose: OtpPurpose.LOGIN },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (lastCode) {
        const elapsed = Date.now() - lastCode.createdAt.getTime();
        if (elapsed < PHONE_RESEND_COOLDOWN_MS) {
          return cooldownResponse(PHONE_RESEND_COOLDOWN_MS - elapsed);
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

      const lastCode = await prisma.otpCode.findFirst({
        where: { email: normalizedEmail, purpose: OtpPurpose.LOGIN },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (lastCode) {
        const elapsed = Date.now() - lastCode.createdAt.getTime();
        if (elapsed < EMAIL_RESEND_COOLDOWN_MS) {
          return cooldownResponse(EMAIL_RESEND_COOLDOWN_MS - elapsed);
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
