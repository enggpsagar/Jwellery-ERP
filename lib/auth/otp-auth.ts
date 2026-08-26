import { prisma } from "@/lib/prisma"
import { OtpPurpose, type User } from "@prisma/client"
import { hashOTP } from "@/lib/auth/otp"
import { sendDisabledAccountEmailSafely } from "@/lib/invite-email"

async function verifyAndConsumeOtp(
  where: { phone: string } | { email: string },
  otpInput: string
) {
  const otp = await prisma.otpCode.findFirst({
    where: { ...where, purpose: OtpPurpose.LOGIN, consumedAt: null },
    orderBy: { createdAt: "desc" },
  })

  if (!otp) throw new Error("OTP not found.")
  if (otp.expiresAt < new Date()) throw new Error("OTP expired.")
  if (otp.codeHash !== hashOTP(otpInput)) throw new Error("Invalid OTP.")

  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  })
}

async function assertCanSignIn(
  user: User | null,
  identifierLabel: string
): Promise<User> {
  if (!user) {
    throw new Error(
      `No account found for this ${identifierLabel}. Ask your admin to add you as a user first.`
    )
  }

  if (!user.isActive) {
    await sendDisabledAccountEmailSafely({
      email: user.email,
      name: user.name || "there",
      role: user.role,
      storeId: user.storeId,
    })
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

export async function verifyOtpLogin(phone: string, otpInput: string) {
  await verifyAndConsumeOtp({ phone }, otpInput)
  const user = await prisma.user.findUnique({ where: { phone } })
  return assertCanSignIn(user, "phone number")
}

export async function verifyEmailOtpLogin(email: string, otpInput: string) {
  const normalizedEmail = email.trim().toLowerCase()
  await verifyAndConsumeOtp({ email: normalizedEmail }, otpInput)
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  return assertCanSignIn(user, "email address")
}
