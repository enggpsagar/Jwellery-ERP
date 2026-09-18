import { prisma } from "@/lib/prisma"
import { OtpPurpose, type User } from "@prisma/client"
import { hashOTP } from "@/lib/auth/otp"
import {
  sendDisabledAccountEmailSafely,
  sendStoreArchivedNoticeSafely,
  sendFailedMobileOtpEmailSafely,
} from "@/lib/invite-email"
import {
  assertNotLocked,
  recordFailedAttempt,
  clearLockout,
  InvalidOtpError,
} from "@/lib/auth/otp-lockout"

async function verifyAndConsumeOtp(
  where: { phone: string } | { email: string },
  otpInput: string,
  identifier: string,
) {
  await assertNotLocked(identifier, OtpPurpose.LOGIN)

  const otp = await prisma.otpCode.findFirst({
    where: { ...where, purpose: OtpPurpose.LOGIN, consumedAt: null },
    orderBy: { createdAt: "desc" },
  })

  if (!otp) throw new Error("OTP not found.")
  if (otp.expiresAt < new Date()) throw new Error("OTP expired.")

  // recordFailedAttempt always throws (InvalidOtpError, either "N attempts
  // remaining" or the 24h lockout message once the cap is hit) — it never
  // returns, so there's nothing to do with its result here beyond letting
  // it propagate.
  if (otp.codeHash !== hashOTP(otpInput)) {
    await recordFailedAttempt(identifier, OtpPurpose.LOGIN)
  }

  await clearLockout(identifier, OtpPurpose.LOGIN)
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
      await sendStoreArchivedNoticeSafely({
        storeId: user.storeId,
        attemptedBy: user.email ?? user.phone ?? null,
      })
      throw new Error(
        "This store has been archived. Your store owner has been notified.",
      )
    }

    // A plan expiry is deliberately NOT a sign-in block: viewing existing
    // data stays available for everyone (including Super Admin support
    // access) once expired — only Create/Update/Export are restricted, and
    // those are enforced centrally in lib/store-context.ts, not here.
  }

  return user
}

export async function verifyOtpLogin(phone: string, otpInput: string) {
  try {
    await verifyAndConsumeOtp({ phone }, otpInput, phone)
  } catch (error) {
    // Every wrong-code guess on the phone channel gets a heads-up email —
    // not just the one that trips the 5-attempt lockout — same reasoning as
    // sendDisabledAccountEmailSafely: a failed sign-in attempt is exactly
    // what a real account owner would want to know about. OtpLockedError
    // (already locked before this call even checked a code) deliberately
    // does NOT reach here — see its own doc comment for why re-notifying on
    // every retry during the 24h window would be wrong.
    if (error instanceof InvalidOtpError) {
      const user = await prisma.user.findUnique({
        where: { phone },
        select: { email: true, name: true, storeId: true },
      })
      if (user) {
        await sendFailedMobileOtpEmailSafely({
          email: user.email,
          name: user.name || "there",
          phone,
          storeId: user.storeId,
          locked: error.locked,
        })
      }
    }
    throw error
  }

  const user = await prisma.user.findUnique({ where: { phone } })
  return assertCanSignIn(user, "phone number")
}

export async function verifyEmailOtpLogin(email: string, otpInput: string) {
  const normalizedEmail = email.trim().toLowerCase()
  await verifyAndConsumeOtp({ email: normalizedEmail }, otpInput, normalizedEmail)
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  return assertCanSignIn(user, "email address")
}
