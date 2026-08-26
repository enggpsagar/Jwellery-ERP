// lib/actions/profile-security-actions.ts
"use server"

import { OtpPurpose } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/auth"
import { generateOTP, hashOTP } from "@/lib/auth/otp"
import { sendMail } from "@/lib/mailer"
import { otpEmail } from "@/lib/email-templates"
import { resolveStoreName } from "@/lib/invite-email"
import { APP_NAME } from "@/lib/constants/app"

export type ProfileSecurityState = {
  success: boolean
  message: string
}

const OTP_TTL_MS = 5 * 60 * 1000

function isValidPhone(phone: string) {
  return /^\d{10}$/.test(phone)
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Step 1 of changing the phone number used to sign in: validate + check for
 * a conflict, then issue an OTP to the NEW number. No SMS provider exists in
 * this app yet (login OTP is dev-console-log only too — see
 * app/api/auth/send-otp/route.ts) so this mirrors that same dev-only
 * delivery until a real SMS integration is added.
 */
export async function sendProfilePhoneChangeOtp(
  newPhone: string
): Promise<ProfileSecurityState> {
  const user = await requireAuth()
  const phone = newPhone.trim()

  if (!isValidPhone(phone)) {
    return { success: false, message: "Enter a valid 10-digit phone number" }
  }

  if (phone === user.phone) {
    return { success: false, message: "That's already your current phone number" }
  }

  const existing = await prisma.user.findUnique({
    where: { phone },
    select: { id: true },
  })

  if (existing && existing.id !== user.id) {
    return { success: false, message: "This phone number is already in use" }
  }

  await prisma.otpCode.deleteMany({
    where: { userId: user.id, phone, purpose: OtpPurpose.PROFILE_PHONE_CHANGE, consumedAt: null },
  })

  const otp = generateOTP()

  await prisma.otpCode.create({
    data: {
      userId: user.id,
      phone,
      purpose: OtpPurpose.PROFILE_PHONE_CHANGE,
      codeHash: hashOTP(otp),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  })

  console.log("=================================")
  console.log("PROFILE PHONE CHANGE OTP:", otp)
  console.log("=================================")

  return { success: true, message: `OTP sent to ${phone}` }
}

export async function verifyProfilePhoneChangeOtp(
  newPhone: string,
  otpInput: string
): Promise<ProfileSecurityState> {
  const user = await requireAuth()
  const phone = newPhone.trim()

  const otp = await prisma.otpCode.findFirst({
    where: {
      userId: user.id,
      phone,
      purpose: OtpPurpose.PROFILE_PHONE_CHANGE,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  })

  if (!otp) return { success: false, message: "OTP not found. Request a new one." }
  if (otp.expiresAt < new Date()) return { success: false, message: "OTP expired. Request a new one." }
  if (otp.codeHash !== hashOTP(otpInput)) return { success: false, message: "Invalid OTP" }

  const conflict = await prisma.user.findUnique({
    where: { phone },
    select: { id: true },
  })

  if (conflict && conflict.id !== user.id) {
    return { success: false, message: "This phone number is already in use" }
  }

  await prisma.$transaction([
    prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({
      where: { id: user.id },
      data: { phone, phoneVerified: new Date() },
    }),
  ])

  return { success: true, message: "Phone number updated" }
}

/**
 * Step 1 of changing the sign-in email: validate + check for a conflict,
 * then email an OTP to the NEW address (real delivery — lib/mailer.ts has a
 * working SMTP transporter already used for invites/statements).
 */
export async function sendProfileEmailChangeOtp(
  newEmail: string
): Promise<ProfileSecurityState> {
  const user = await requireAuth()
  const email = newEmail.trim().toLowerCase()

  if (!isValidEmail(email)) {
    return { success: false, message: "Enter a valid email address" }
  }

  if (email === user.email?.toLowerCase()) {
    return { success: false, message: "That's already your current email" }
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  })

  if (existing && existing.id !== user.id) {
    return { success: false, message: "This email is already in use" }
  }

  await prisma.otpCode.deleteMany({
    where: { userId: user.id, email, purpose: OtpPurpose.PROFILE_EMAIL_CHANGE, consumedAt: null },
  })

  const otp = generateOTP()

  await prisma.otpCode.create({
    data: {
      userId: user.id,
      email,
      purpose: OtpPurpose.PROFILE_EMAIL_CHANGE,
      codeHash: hashOTP(otp),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  })

  const { subject, html, text } = otpEmail({
    code: otp,
    appName: APP_NAME,
    storeName: user.storeId ? await resolveStoreName(user.storeId) : null,
    expiryMinutes: OTP_TTL_MS / 60_000,
    recipientName: user.name,
    purpose: "email-change",
  })

  const result = await sendMail({ to: email, subject, html, text })

  if (!result.sent) {
    console.log("=================================")
    console.log("PROFILE EMAIL CHANGE OTP (email send failed, dev fallback):", otp)
    console.log("=================================")
  }

  return { success: true, message: `OTP sent to ${email}` }
}

export async function verifyProfileEmailChangeOtp(
  newEmail: string,
  otpInput: string
): Promise<ProfileSecurityState> {
  const user = await requireAuth()
  const email = newEmail.trim().toLowerCase()

  const otp = await prisma.otpCode.findFirst({
    where: {
      userId: user.id,
      email,
      purpose: OtpPurpose.PROFILE_EMAIL_CHANGE,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  })

  if (!otp) return { success: false, message: "OTP not found. Request a new one." }
  if (otp.expiresAt < new Date()) return { success: false, message: "OTP expired. Request a new one." }
  if (otp.codeHash !== hashOTP(otpInput)) return { success: false, message: "Invalid OTP" }

  const conflict = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  })

  if (conflict && conflict.id !== user.id) {
    return { success: false, message: "This email is already in use" }
  }

  await prisma.$transaction([
    prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({
      where: { id: user.id },
      data: { email, emailVerified: new Date() },
    }),
  ])

  return { success: true, message: "Email address updated" }
}
