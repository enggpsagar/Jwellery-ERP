import { prisma } from "@/lib/prisma"
import { OtpPurpose } from "@prisma/client"
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

  const user = await prisma.user.findUnique({
    where: { phone },
  })

  if (!user) {
    throw new Error(
      "No account found for this phone number. Ask your admin to add you as a user first."
    )
  }

  if (!user.isActive) {
    throw new Error("Your account has been disabled.")
  }

  if (user.storeId) {
    const store = await prisma.store.findUnique({
      where: { id: user.storeId },
      select: { isActive: true },
    })

    if (store && !store.isActive) {
      throw new Error("This store has been archived. Contact your administrator.")
    }
  }

  return user
}