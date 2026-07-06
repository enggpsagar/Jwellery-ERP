// File: src/app/api/auth/send-otp/route.ts

import { NextRequest, NextResponse } from "next/server";
import { OtpPurpose } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { generateOTP, hashOTP } from "@/lib/auth/otp";

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json(
        { error: "Phone number is required." },
        { status: 400 }
      );
    }

    await prisma.otpCode.deleteMany({
      where: {
        phone,
        purpose: OtpPurpose.LOGIN,
        consumedAt: null,
      },
    });

    const otp = generateOTP();

    await prisma.otpCode.create({
      data: {
        phone,
        purpose: OtpPurpose.LOGIN,
        codeHash: hashOTP(otp),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    console.log("=================================");
    console.log("OTP:", otp);
    console.log("=================================");

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