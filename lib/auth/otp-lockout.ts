import { prisma } from "@/lib/prisma"
import { OtpPurpose } from "@prisma/client"
import { MAX_OTP_ATTEMPTS, OTP_LOCKOUT_MS } from "@/lib/auth/otp-policy"

/** Thrown by assertNotLocked when a phone/email is already inside its 24h
 * lockout window — distinct from InvalidOtpError below since no code was
 * even checked on this call, so it must never trigger a new failed-attempt
 * email of its own (that would fire on every retry for the whole 24h). */
export class OtpLockedError extends Error {
  constructor(public lockedUntil: Date) {
    super("Too many failed attempts. Please try again after 24 hours.")
  }
}

/** Thrown for a genuine wrong-code guess — including the one that trips
 * the lockout. `locked` tells the caller whether THIS attempt was the one
 * that just locked the account, since that still counts as "OTP validation
 * failed" for the mobile-failure-notification requirement, unlike a retry
 * that arrives after it's already locked (OtpLockedError above). */
export class InvalidOtpError extends Error {
  constructor(message: string, public locked: boolean) {
    super(message)
  }
}

async function getLockoutRow(identifier: string, purpose: OtpPurpose) {
  return prisma.otpLockout.findUnique({
    where: { identifier_purpose: { identifier, purpose } },
  })
}

/** Raw attempt/lock state for the otp-status endpoint — never throws. */
export async function getOtpLockoutState(identifier: string, purpose: OtpPurpose) {
  const row = await getLockoutRow(identifier, purpose)
  const lockedUntil = row?.lockedUntil && row.lockedUntil > new Date() ? row.lockedUntil : null
  return {
    attemptsRemaining: Math.max(0, MAX_OTP_ATTEMPTS - (row?.failedAttempts ?? 0)),
    lockedUntil,
  }
}

/** Guards both sending and verifying — refuses either while locked. */
export async function assertNotLocked(identifier: string, purpose: OtpPurpose) {
  const row = await getLockoutRow(identifier, purpose)
  if (row?.lockedUntil && row.lockedUntil > new Date()) {
    throw new OtpLockedError(row.lockedUntil)
  }
}

/**
 * Records one wrong-code guess and throws the right error for it — either
 * "N attempts remaining" or, once the cap is hit, the 24h lockout message.
 * Upserts rather than requiring a pre-existing row, since the very first
 * wrong guess against a phone/email has none yet.
 */
export async function recordFailedAttempt(identifier: string, purpose: OtpPurpose): Promise<never> {
  const existing = await getLockoutRow(identifier, purpose)
  const nextCount = (existing?.failedAttempts ?? 0) + 1
  const justLocked = nextCount >= MAX_OTP_ATTEMPTS
  const lockedUntil = justLocked ? new Date(Date.now() + OTP_LOCKOUT_MS) : null

  await prisma.otpLockout.upsert({
    where: { identifier_purpose: { identifier, purpose } },
    create: { identifier, purpose, failedAttempts: nextCount, lockedUntil },
    // Resets the counter once locked rather than leaving it at 5+ — once
    // lockedUntil passes, this identifier should get a clean 5 attempts
    // again, not zero.
    update: { failedAttempts: justLocked ? 0 : nextCount, lockedUntil },
  })

  if (justLocked) {
    throw new InvalidOtpError(
      "Too many failed attempts. Please try again after 24 hours.",
      true,
    )
  }

  const attemptsRemaining = MAX_OTP_ATTEMPTS - nextCount
  throw new InvalidOtpError(
    `Invalid OTP. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining.`,
    false,
  )
}

/** Wipes any accumulated failed-attempt count on a successful verification. */
export async function clearLockout(identifier: string, purpose: OtpPurpose) {
  await prisma.otpLockout.deleteMany({ where: { identifier, purpose } })
}
