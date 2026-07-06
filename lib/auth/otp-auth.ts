import { prisma } from "@/lib/prisma"
import { OtpPurpose, UserRole, UserStatus } from "@prisma/client"
import { hashOTP } from "@/lib/auth/otp"

export async function verifyOtpLogin(phone: string, otpInput: string) {
  const otp = await prisma.otpCode.findFirst({
    where: {
      phone,
      purpose: OtpPurpose.LOGIN,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  })

  if (!otp) throw new Error("OTP not found.")
  if (otp.expiresAt < new Date()) throw new Error("OTP expired.")
  if (otp.codeHash !== hashOTP(otpInput)) throw new Error("Invalid OTP.")

  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  })

  let user = await prisma.user.findUnique({
    where: { phone },
  })

  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
        status: UserStatus.ACTIVE,
        role: UserRole.STAFF,
        isActive: true,
      },
    })
  }

  if (!user.isActive) {
    throw new Error("Your account has been disabled.")
  }

  return user
}