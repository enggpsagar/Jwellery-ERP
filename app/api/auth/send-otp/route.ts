// File: src/app/api/auth/send-otp/route.ts

import { NextRequest, NextResponse } from "next/server";
import { OtpPurpose } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { generateOTP, hashOTP } from "@/lib/auth/otp";
import { sendMail } from "@/lib/mailer";

const OTP_TTL_MS = 5 * 60 * 1000;

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

      const result = await sendMail({
        to: normalizedEmail,
        subject: "Your sign-in code",
        html: `<p>Your sign-in code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px;">${otp}</p><p>This code expires in 5 minutes. If you didn't request this, you can ignore this email.</p>`,
        text: `Your sign-in code is ${otp}. It expires in 5 minutes.`,
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
    console.error("SEND OTP ERROR:", error);

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
